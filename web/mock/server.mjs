/**
 * RentHub 假后端（mock backend）
 *
 * 目标：用零依赖的 Node 内置 http，**严格模仿《RentHub 技术文档》第 5 章的接口契约**，
 * 让前端与自动测试可以在没有真后端的情况下跑通全部行为：
 *
 *   · 前缀 /api/v1，Bearer 鉴权，错误体固定 {code, message, details, trace_id}
 *   · 游标分页 limit/cursor → items/next_cursor
 *   · 订单五态状态机、房源锁定、资质闸门、支付幂等键、SSE 流式 AI
 *   · 额外提供 /__mock__/* 测试钩子（reset / state / tick / 故障注入），真后端没有
 *
 * 运行：
 *   node mock/server.mjs                 # http://127.0.0.1:8787
 *   PORT=9000 node mock/server.mjs
 *   MOCK_ACCESS_TTL=5 node mock/server.mjs   # access token 5 秒过期，便于测 401 刷新
 *
 * 依赖：无（只用 node:http / node:crypto / node:url / node:fs）
 */
import { createServer } from 'node:http'
import { createHmac, randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as seed from './data/seed.mjs'

/* ==========================================================================
 * 常量与通用工具
 * ========================================================================== */

const JWT_SECRET = process.env.MOCK_JWT_SECRET || 'renthub-mock-secret'
const ACCESS_TTL = Number(process.env.MOCK_ACCESS_TTL || 900) // 秒
const REFRESH_TTL = 7 * 24 * 3600
const SSE_DELAY = Number(process.env.MOCK_SSE_DELAY || 0)
const MAX_UPLOAD = 5 * 1024 * 1024
const BASE_NOW = Date.parse(process.env.MOCK_NOW || '2026-11-05T09:00:00+08:00')

const CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_ROLE_MISMATCH: 'AUTH_ROLE_MISMATCH',
  AUTH_LOCKED: 'AUTH_LOCKED',
  AUTH_ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',
  AUTH_ACCOUNT_TAKEN: 'AUTH_ACCOUNT_TAKEN',
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_REFRESH_REUSED: 'AUTH_REFRESH_REUSED',
  ROLE_FORBIDDEN: 'ROLE_FORBIDDEN',
  QUALIFICATION_REQUIRED: 'QUALIFICATION_REQUIRED',
  LISTING_LOCKED: 'LISTING_LOCKED',
  LISTING_STATE_INVALID: 'LISTING_STATE_INVALID',
  ORDER_STATE_INVALID: 'ORDER_STATE_INVALID',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TYPE_INVALID: 'FILE_TYPE_INVALID',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
}

class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

const fail = (status, code, message, details) => {
  throw new ApiError(status, code, message, details)
}
const bad = (message, details) => fail(422, CODES.VALIDATION_FAILED, message, details)
const b64u = (s) => Buffer.from(s).toString('base64url')
const unb64u = (s) => Buffer.from(s, 'base64url').toString('utf8')
const sign = (payload) => createHmac('sha256', JWT_SECRET).update(payload).digest('base64url')
const yuan = (cents) => (cents / 100).toFixed(2)

function makeToken(kind, userId, ttl) {
  const payload = b64u(JSON.stringify({ kind, uid: userId, exp: Date.now() + ttl * 1000, jti: randomUUID() }))
  return `${payload}.${sign(payload)}`
}
function verifyToken(raw, kind) {
  if (!raw) fail(401, CODES.AUTH_TOKEN_MISSING, '请先登录')
  const [payload, sig] = String(raw).split('.')
  if (!payload || !sig || sign(payload) !== sig) fail(401, CODES.AUTH_TOKEN_INVALID, '登录状态无效，请重新登录')
  let data
  try {
    data = JSON.parse(unb64u(payload))
  } catch {
    fail(401, CODES.AUTH_TOKEN_INVALID, '登录状态无效，请重新登录')
  }
  if (data.kind !== kind) fail(401, CODES.AUTH_TOKEN_INVALID, '登录状态无效，请重新登录')
  if (Date.now() > data.exp) fail(401, CODES.AUTH_TOKEN_EXPIRED, '登录已过期，请重新登录')
  return data
}

/* ==========================================================================
 * 可变状态（reset 恢复种子）
 * ========================================================================== */

function createState() {
  const clone = (v) => JSON.parse(JSON.stringify(v))
  return {
    now: BASE_NOW,
    users: clone(seed.USERS),
    qualifications: clone(seed.QUALIFICATIONS),
    reviews: [],
    listings: clone(seed.LISTINGS),
    favorites: clone(seed.FAVORITES),
    orders: clone(seed.ORDERS),
    orderLogs: clone(seed.ORDER_LOGS),
    payments: clone(seed.PAYMENTS),
    notifications: clone(seed.NOTIFICATIONS),
    aiSessions: clone(seed.AI_SESSIONS),
    aiMessages: clone(seed.AI_MESSAGES),
    sessions: new Map(), // refresh token -> userId
    usedRefresh: new Set(),
    loginAttempts: new Map(),
    idempotency: new Map(),
    seq: { user: 100, listing: 200, order: 2000, payment: 100, notification: 100, log: 100, review: 1, session: 100, message: 100, file: 1 },
  }
}

let S = createState()

const nowIso = () => new Date(S.now).toISOString()
const nextId = (key) => ++S.seq[key]
const fmtOrderNo = (id) => `${new Date(S.now).toISOString().slice(0, 10).replace(/-/g, '')}-${String(id).padStart(6, '0')}`

const regionName = (code) => seed.REGIONS.find((r) => r.code === code)?.name ?? code
const userById = (id) => S.users.find((u) => u.id === id)
const listingById = (id) => S.listings.find((l) => l.id === Number(id) && !l.deletedAt)
const qualifiedMerchant = (userId) => S.qualifications.some((q) => q.userId === userId && q.status === 'approved')

/* ==========================================================================
 * 序列化（DB 行 → 接口 DTO）
 * ========================================================================== */

function listingCard(l) {
  const tags = []
  if (l.metroLine && l.walkMinutes != null) tags.push(`近地铁 ${l.walkMinutes} 分钟`)
  if (l.hasElevator) tags.push('有电梯')
  if (l.decoration) tags.push(seed.DECORATIONS.find((d) => d.code === l.decoration)?.name ?? l.decoration)
  return {
    id: l.id,
    title: l.title,
    cover: `/mock-files/${l.images?.[0]?.key ?? `listing/${l.id}.jpg`}`,
    region_name: regionName(l.regionCode),
    community: l.community ?? '',
    layout: `${l.rooms}室${l.halls}厅`,
    area: Number(l.area),
    floor_desc: `${l.floor}/${l.totalFloor} 层`,
    rent: l.rent,
    tags,
  }
}

function listingDetail(l) {
  const q = S.qualifications.find((x) => x.userId === l.merchantId)
  const merchant = userById(l.merchantId)
  return {
    ...listingCard(l),
    description: l.description ?? '',
    address: l.address,
    metro: l.metroLine ? { line: l.metroLine, walk_minutes: l.walkMinutes ?? 0 } : null,
    spec: {
      rooms: l.rooms,
      halls: l.halls,
      baths: l.baths,
      floor: l.floor,
      total_floor: l.totalFloor,
      orientation: seed.ORIENTATIONS.find((o) => o.code === l.orientation)?.name ?? l.orientation ?? '',
      decoration: seed.DECORATIONS.find((d) => d.code === l.decoration)?.name ?? l.decoration ?? '',
      house_type: seed.HOUSE_TYPES.find((h) => h.code === l.houseType)?.name ?? l.houseType ?? '',
      rent_type: l.rentType,
      available_date: l.availableDate,
      min_lease_months: l.minLeaseMonths,
    },
    facilities: l.facilities,
    images: (l.images ?? []).map((i) => `/mock-files/${i.key}`),
    price: {
      rent: l.rent,
      deposit: l.deposit,
      service_fee: Math.round(l.rent * l.serviceFeeRate * (l.minLeaseMonths || 1)),
      service_fee_rate: l.serviceFeeRate,
    },
    /* 旧版详情页 kv 需要的字段 */
    region_code: l.regionCode,
    payment_method: l.paymentMethod ?? null,
    viewing_method: l.viewingMethod ?? null,
    parking: l.parking ?? null,
    merchant: {
      id: l.merchantId,
      name: merchant?.nickname ?? '未知商家',
      listing_count: S.listings.filter((x) => x.merchantId === l.merchantId && x.status === 'online').length,
      verified: q?.status === 'approved',
    },
    status: l.status,
    view_count: l.viewCount,
    favorite_count: S.favorites.filter((f) => f.listingId === l.id).length,
  }
}

function meDto(u) {
  const q = S.qualifications.find((x) => x.userId === u.id)
  return {
    id: u.id,
    account: u.account,
    role: u.role,
    nickname: u.nickname,
    phone: u.phone ?? null,
    status: u.status,
    qualification_status: u.role === 'merchant' ? (q?.status ?? 'not_submitted') : null,
    initial: u.nickname.slice(0, 1),
    created_at: u.createdAt,
  }
}

function orderDto(o, detail = false) {
  const l = listingById(o.listingId)
  const base = {
    id: o.id,
    order_no: o.orderNo,
    status: o.status,
    snapshot: o.snapshot,
    rent: o.rent,
    months: o.months,
    deposit: o.deposit,
    service_fee: o.serviceFee,
    total_amount: o.totalAmount,
    check_in_date: o.checkInDate,
    created_at: o.createdAt,
  }
  if (!detail) return base
  const logs = S.orderLogs
    .filter((x) => x.orderId === o.id)
    .map((x) => ({
      from_status: x.fromStatus,
      to_status: x.toStatus,
      operator_name: userById(x.operatorId)?.nickname ?? '系统',
      reason: x.reason,
      created_at: x.createdAt,
    }))
  const payments = S.payments
    .filter((p) => p.orderId === o.id)
    .map((p) => ({ id: p.id, order_id: p.orderId, type: p.type, amount: p.amount, trade_no: p.tradeNo, created_at: p.createdAt }))
  const paid = payments.some((p) => p.type === 'pay')
  return {
    ...base,
    listing_title: l?.title ?? o.snapshot?.title ?? '',
    cover: l ? `/mock-files/${l.images?.[0]?.key ?? ''}` : '',
    logs,
    payments,
    can_confirm: o.status === 'pending',
    can_reject: o.status === 'pending',
    can_complete: o.status === 'confirmed',
    can_cancel: o.status === 'pending' || o.status === 'confirmed',
    can_pay: (o.status === 'pending' || o.status === 'confirmed') && !paid,
  }
}

const noticeDto = (n) => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  target_type: n.targetType,
  target_id: n.targetId,
  is_read: n.isRead,
  created_at: n.createdAt,
})

function notificationCount(userId) {
  return {
    favorites: S.favorites.filter((f) => f.userId === userId).length,
    orders: S.orders.filter((o) => o.tenantId === userId).length,
    messages: S.notifications.filter((n) => n.userId === userId && !n.isRead).length,
  }
}

function pushNotice(userId, type, title, body, targetType = null, targetId = null) {
  const n = { id: nextId('notification'), userId, type, title, body, targetType, targetId, isRead: false, createdAt: nowIso() }
  S.notifications.push(n)
  return n
}

/* ==========================================================================
 * 请求上下文：鉴权 / 分页 / 工具
 * ========================================================================== */

function currentUser(req, { role } = {}) {
  const header = req.headers.authorization || ''
  const raw = header.startsWith('Bearer ') ? header.slice(7) : ''
  const data = verifyToken(raw, 'access')
  const u = userById(data.uid)
  if (!u) fail(401, CODES.AUTH_TOKEN_INVALID, '登录状态无效，请重新登录')
  if (u.status === 'disabled') fail(403, CODES.AUTH_ACCOUNT_DISABLED, '账号已被禁用')
  if (role && u.role !== role) fail(403, CODES.ROLE_FORBIDDEN, '没有权限执行该操作')
  return u
}

function page(items, q, keyOf) {
  const limit = Math.min(Math.max(Number(q.get('limit') || 20), 1), 50)
  const cursor = q.get('cursor')
  let start = 0
  if (cursor) {
    const decoded = JSON.parse(unb64u(cursor))
    start = items.findIndex((it) => keyOf(it) === decoded.k) + 1
    if (start <= 0) start = 0
  }
  const slice = items.slice(start, start + limit)
  const last = slice[slice.length - 1]
  const next = last && start + limit < items.length ? b64u(JSON.stringify({ k: keyOf(last) })) : null
  return { items: slice, next_cursor: next }
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > MAX_UPLOAD + 1024 * 1024) fail(413, CODES.FILE_TOO_LARGE, '上传内容过大')
    chunks.push(c)
  }
  return Buffer.concat(chunks)
}

async function readJson(req) {
  const buf = await readBody(req)
  if (!buf.length) return {}
  try {
    return JSON.parse(buf.toString('utf8'))
  } catch {
    bad('请求体不是合法 JSON')
  }
}

function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '')
  if (missing.length) bad('参数校验未通过', missing.map((f) => ({ field: f, message: '必填' })))
}

const isDigits = (s) => /^[a-zA-Z0-9]{4,20}$/.test(s)
const isPassword = (s) => typeof s === 'string' && s.length >= 8 && s.length <= 20 && /[a-zA-Z]/.test(s) && /\d/.test(s)

/* ==========================================================================
 * 业务实现
 * ========================================================================== */

const api = {}

/* ---------- 认证 ---------- */
api['POST /api/v1/auth/register'] = async ({ body }) => {
  const { account, password, role, nickname } = body
  requireFields(body, ['account', 'password', 'role'])
  if (!isDigits(account)) bad('账号需为 4-20 位字母或数字', [{ field: 'account', message: '格式不符' }])
  if (!isPassword(password)) bad('密码需 8-20 位且同时包含字母与数字', [{ field: 'password', message: '格式不符' }])
  if (!['tenant', 'merchant'].includes(role)) bad('管理员账号不开放注册', [{ field: 'role', message: '非法取值' }])
  if (S.users.some((u) => u.account === account)) fail(409, CODES.AUTH_ACCOUNT_TAKEN, '该账号已被注册')

  const user = {
    id: nextId('user'),
    account,
    password,
    role,
    nickname: nickname?.trim() || `栖居用户${String(Math.floor(Math.random() * 9000) + 1000)}`,
    phone: null,
    status: 'active',
    createdAt: nowIso(),
  }
  S.users.push(user)
  if (role === 'merchant') {
    S.qualifications.push({
      id: S.qualifications.length + 1,
      userId: user.id,
      legalName: '',
      status: 'not_submitted',
      submittedAt: null,
      reviewedAt: null,
      reviewerId: null,
      rejectReason: null,
      files: [],
    })
  }
  const access = makeToken('access', user.id, ACCESS_TTL)
  const refresh = makeToken('refresh', user.id, REFRESH_TTL)
  S.sessions.set(refresh, user.id)
  return { status: 201, body: { access_token: access, refresh_token: refresh, expires_in: ACCESS_TTL, user: meDto(user) } }
}

api['POST /api/v1/auth/login'] = async ({ body }) => {
  const { account, password, role, remember } = body
  requireFields(body, ['account', 'password', 'role'])

  const attempt = S.loginAttempts.get(account)
  if (attempt?.lockUntil && attempt.lockUntil > Date.now()) {
    fail(423, CODES.AUTH_LOCKED, `登录失败次数过多，请 ${new Date(attempt.lockUntil).toISOString().slice(11, 16)} 后再试`)
  }

  const user = S.users.find((u) => u.account === account)
  if (!user || user.password !== password) {
    const rec = S.loginAttempts.get(account) || { fails: 0 }
    rec.fails += 1
    if (rec.fails >= 5) {
      rec.fails = 0
      rec.lockUntil = Date.now() + 15 * 60 * 1000
    }
    S.loginAttempts.set(account, rec)
    fail(401, CODES.AUTH_INVALID_CREDENTIALS, '账号或密码错误')
  }
  if (user.status === 'disabled') fail(403, CODES.AUTH_ACCOUNT_DISABLED, '账号已被禁用，请联系管理员')
  if (user.role !== role) fail(403, CODES.AUTH_ROLE_MISMATCH, '登录入口与账号角色不符')

  S.loginAttempts.delete(account)
  const access = makeToken('access', user.id, ACCESS_TTL)
  const refresh = makeToken('refresh', user.id, remember ? REFRESH_TTL : 24 * 3600)
  S.sessions.set(refresh, user.id)
  return { body: { access_token: access, refresh_token: refresh, expires_in: ACCESS_TTL, user: meDto(user), counts: notificationCount(user.id) } }
}

// 文档未定义 refresh 端点，这里按常见做法补充（README 已标注，真后端需对齐）
api['POST /api/v1/auth/refresh'] = async ({ body }) => {
  const { refresh_token: token } = body
  requireFields(body, ['refresh_token'])
  if (!S.sessions.has(token)) {
    if (S.usedRefresh.has(token)) fail(401, CODES.AUTH_REFRESH_REUSED, '刷新令牌已被使用，请重新登录')
    fail(401, CODES.AUTH_TOKEN_INVALID, '刷新令牌无效，请重新登录')
  }
  const data = verifyToken(token, 'refresh')
  S.sessions.delete(token)
  S.usedRefresh.add(token)
  const access = makeToken('access', data.uid, ACCESS_TTL)
  const refresh = makeToken('refresh', data.uid, REFRESH_TTL)
  S.sessions.set(refresh, data.uid)
  return { body: { access_token: access, refresh_token: refresh, expires_in: ACCESS_TTL, user: meDto(userById(data.uid)) } }
}

api['GET /api/v1/auth/me'] = async ({ req }) => {
  const u = currentUser(req)
  return { body: { ...meDto(u), counts: notificationCount(u.id) } }
}

api['PUT /api/v1/auth/password'] = async ({ req, body }) => {
  const u = currentUser(req)
  requireFields(body, ['old_password', 'new_password'])
  if (u.password !== body.old_password) bad('当前密码不正确', [{ field: 'old_password', message: '密码错误' }])
  if (!isPassword(body.new_password)) bad('新密码需 8-20 位且同时包含字母与数字', [{ field: 'new_password', message: '格式不符' }])
  u.password = body.new_password
  for (const [token, uid] of [...S.sessions]) if (uid === u.id) S.sessions.delete(token)
  return { body: { ok: true } }
}

api['POST /api/v1/auth/logout'] = async ({ req }) => {
  const header = req.headers.authorization || ''
  const raw = header.startsWith('Bearer ') ? header.slice(7) : ''
  try {
    const data = verifyToken(raw, 'access')
    for (const [token, uid] of [...S.sessions]) if (uid === data.uid) S.sessions.delete(token)
  } catch {
    /* 已过期也允许退出 */
  }
  return { status: 204 }
}

/* ---------- 字典与上传 ---------- */
api['GET /api/v1/meta/filters'] = async () => ({ body: seed.FILTERS })

api['POST /api/v1/files'] = async ({ req }) => {
  currentUser(req)
  const buf = await readBody(req)
  const ctype = String(req.headers['content-type'] || '')
  if (!ctype.includes('multipart/form-data')) bad('需要 multipart/form-data')
  const boundary = `--${ctype.split('boundary=')[1]}`
  const parts = buf.toString('latin1').split(boundary)
  const filePart = parts.find((p) => /name="file"/.test(p) && /filename="/.test(p))
  if (!filePart) bad('缺少 file 字段', [{ field: 'file', message: '必填' }])
  const typeMatch = filePart.match(/Content-Type:\s*([^\r\n]+)/i)
  const mime = typeMatch ? typeMatch[1].trim() : ''
  if (!['image/jpeg', 'image/png'].includes(mime)) fail(422, CODES.FILE_TYPE_INVALID, '仅支持 jpg 或 png')
  const bodyStart = filePart.indexOf('\r\n\r\n') + 4
  const bodyEnd = filePart.lastIndexOf('\r\n')
  const size = bodyEnd - bodyStart
  if (size > MAX_UPLOAD) fail(413, CODES.FILE_TOO_LARGE, '单张图片不能超过 5MB')
  const nameMatch = filePart.match(/filename="([^"]*)"/)
  const fileName = nameMatch ? nameMatch[1] : 'upload.png'
  const ext = mime === 'image/png' ? 'png' : 'jpg'
  const objectKey = `upload/${Date.now()}-${nextId('file')}.${ext}`
  return {
    status: 201,
    body: { object_key: objectKey, url: `/mock-files/${objectKey}`, file_name: fileName, size },
  }
}

/* ---------- 房源 ---------- */
api['GET /api/v1/listings'] = async ({ q }) => {
  const region = q.get('region')
  const metro = q.get('metro_line')
  if (region && metro) bad('region 与 metro_line 互斥')
  const rentMin = q.get('rent_min') ? Number(q.get('rent_min')) : undefined
  const rentMax = q.get('rent_max') ? Number(q.get('rent_max')) : undefined
  const rooms = q.get('rooms')
  const rentType = q.get('rent_type')
  const houseType = q.get('house_type')
  const orientation = q.get('orientation')
  const elevator = q.get('has_elevator')
  const nearMetro = q.get('near_metro')
  const keyword = (q.get('keyword') || '').trim()
  const sort = q.get('sort') || 'composite'

  let items = S.listings.filter((l) => l.status === 'online' && !l.deletedAt)
  if (keyword) {
    const k = keyword.toLowerCase()
    items = items.filter((l) =>
      [l.title, l.community, l.address, l.description].some((t) => String(t || '').toLowerCase().includes(k)),
    )
  }
  if (region) {
    const codes = region.split(',').map((s) => s.trim()).filter(Boolean)
    items = items.filter((l) => codes.includes(l.regionCode))
  }
  if (metro) items = items.filter((l) => String(l.metroLine) === String(metro))
  if (rentMin !== undefined) items = items.filter((l) => l.rent >= rentMin)
  if (rentMax !== undefined) items = items.filter((l) => l.rent <= rentMax)
  if (rooms) {
    const want = rooms.split(',').map(Number).filter((n) => !Number.isNaN(n))
    items = items.filter((l) => want.some((n) => (n >= 5 ? l.rooms >= 5 : l.rooms === n)))
  }
  if (rentType) items = items.filter((l) => l.rentType === rentType)
  if (houseType) items = items.filter((l) => l.houseType === houseType)
  if (orientation) items = items.filter((l) => l.orientation === orientation)
  if (elevator === 'true') items = items.filter((l) => l.hasElevator)
  if (nearMetro === 'true') items = items.filter((l) => l.metroLine && (l.walkMinutes ?? 99) <= 10)

  const sorters = {
    composite: (a, b) => b.favoriteCount * 3 + b.viewCount - (a.favoriteCount * 3 + a.viewCount) || b.id - a.id,
    latest: (a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)) || b.id - a.id,
    price_asc: (a, b) => a.rent - b.rent || a.id - b.id,
    price_desc: (a, b) => b.rent - a.rent || b.id - a.id,
  }
  if (!sorters[sort]) bad('排序参数不合法', [{ field: 'sort', message: '取值必须为 composite/latest/price_asc/price_desc' }])
  items.sort(sorters[sort])

  const paged = page(items, q, (l) => `${l.id}`)
  return { body: { items: paged.items.map(listingCard), next_cursor: paged.next_cursor, total: items.length } }
}

api['GET /api/v1/listings/:id'] = async ({ params, req }) => {
  const l = listingById(params.id)
  if (!l) fail(404, CODES.NOT_FOUND, '房源不存在或已删除')
  l.viewCount += 1
  let favorited = false
  try {
    const u = currentUser(req)
    favorited = S.favorites.some((f) => f.userId === u.id && f.listingId === l.id)
  } catch {
    favorited = false
  }
  return { body: { ...listingDetail(l), favorited } }
}

function listingWritePayload(body) {
  const fields = ['title', 'region_code', 'address', 'rooms', 'area', 'rent_type', 'rent', 'deposit', 'available_date']
  requireFields(body, fields)
  if (body.rent <= 0) bad('租金必须大于 0', [{ field: 'rent', message: '必须大于 0' }])
  if (body.deposit < 0) bad('押金不能为负', [{ field: 'deposit', message: '不能为负' }])
  if (!['whole', 'shared'].includes(body.rent_type)) bad('租赁类型不合法', [{ field: 'rent_type', message: '取值必须为 whole/shared' }])
  if (!seed.REGIONS.some((r) => r.code === body.region_code)) bad('区域编码不存在', [{ field: 'region_code', message: '未知区域' }])
  return {
    title: body.title,
    description: body.description ?? '',
    regionCode: body.region_code,
    community: body.community ?? '',
    address: body.address,
    metroLine: body.metro_line ?? null,
    walkMinutes: body.walk_minutes ?? null,
    rooms: Number(body.rooms),
    halls: Number(body.halls ?? 0),
    baths: Number(body.baths ?? 0),
    area: Number(body.area),
    floor: body.floor ?? null,
    totalFloor: body.total_floor ?? null,
    orientation: body.orientation ?? null,
    decoration: body.decoration ?? null,
    houseType: body.house_type ?? null,
    rentType: body.rent_type,
    hasElevator: Boolean(body.has_elevator),
    facilities: body.facilities ?? { bed: [], public: [] },
    rent: Number(body.rent),
    deposit: Number(body.deposit),
    availableDate: body.available_date,
    minLeaseMonths: Number(body.min_lease_months ?? 6),
    paymentMethod: body.payment_method ?? null,
    viewingMethod: body.viewing_method ?? null,
    parking: body.parking ?? null,
    images: (body.images ?? []).map((key, i) => ({ key, sort: i, isCover: i === 0 })),
  }
}

api['POST /api/v1/listings'] = async ({ req, body }) => {
  const u = currentUser(req, { role: 'merchant' })
  const dto = listingWritePayload(body)
  if (!qualifiedMerchant(u.id)) fail(403, CODES.QUALIFICATION_REQUIRED, '资质通过后才能发布房源')
  const listing = {
    id: nextId('listing'),
    merchantId: u.id,
    ...dto,
    serviceFeeRate: 0.05,
    status: 'offline',
    publishedAt: null,
    viewCount: 0,
    favoriteCount: 0,
    createdAt: nowIso(),
  }
  S.listings.push(listing)
  return { status: 201, body: { id: listing.id, status: listing.status } }
}

api['PUT /api/v1/listings/:id'] = async ({ req, params, body }) => {
  const u = currentUser(req, { role: 'merchant' })
  const l = listingById(params.id)
  if (!l) fail(404, CODES.NOT_FOUND, '房源不存在')
  if (l.merchantId !== u.id) fail(403, CODES.ROLE_FORBIDDEN, '只能编辑自己的房源')
  if (['locked', 'rented'].includes(l.status)) fail(409, CODES.LISTING_STATE_INVALID, '房源已锁定或已出租，暂不能编辑')
  Object.assign(l, listingWritePayload(body))
  return { body: { id: l.id, status: l.status } }
}

api['PATCH /api/v1/listings/:id/status'] = async ({ req, params, body }) => {
  const u = currentUser(req, { role: 'merchant' })
  const l = listingById(params.id)
  if (!l) fail(404, CODES.NOT_FOUND, '房源不存在')
  if (l.merchantId !== u.id) fail(403, CODES.ROLE_FORBIDDEN, '只能操作自己的房源')
  const status = body.status
  if (!['online', 'offline'].includes(status)) bad('状态只能是 online 或 offline')
  if (status === 'online' && !qualifiedMerchant(u.id)) fail(403, CODES.QUALIFICATION_REQUIRED, '资质通过后才能上架')
  if (['locked', 'rented'].includes(l.status)) fail(409, CODES.LISTING_STATE_INVALID, '房源已锁定或已出租')
  l.status = status
  l.publishedAt = status === 'online' ? nowIso() : l.publishedAt
  return { body: { id: l.id, status: l.status } }
}

api['GET /api/v1/favorites'] = async ({ req, q }) => {
  const u = currentUser(req)
  const rows = S.favorites.filter((f) => f.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const items = rows.map((f) => listingById(f.listingId)).filter(Boolean)
  const paged = page(items, q, (l) => `${l.id}`)
  return { body: { items: paged.items.map(listingCard), next_cursor: paged.next_cursor } }
}

api['POST /api/v1/favorites'] = async ({ req, body }) => {
  const u = currentUser(req)
  const l = listingById(body.listing_id)
  if (!l) fail(404, CODES.NOT_FOUND, '房源不存在')
  const on = Boolean(body.on)
  const exists = S.favorites.some((f) => f.userId === u.id && f.listingId === l.id)
  if (on && !exists) S.favorites.push({ userId: u.id, listingId: l.id, createdAt: nowIso() })
  if (!on && exists) S.favorites = S.favorites.filter((f) => !(f.userId === u.id && f.listingId === l.id))
  return { body: { listing_id: l.id, favorited: on, count: S.favorites.filter((f) => f.listingId === l.id).length } }
}

/* ---------- 订单 ---------- */
api['POST /api/v1/orders'] = async ({ req, body }) => {
  const u = currentUser(req, { role: 'tenant' })
  requireFields(body, ['listing_id', 'months', 'check_in_date'])
  const l = listingById(body.listing_id)
  if (!l) fail(404, CODES.NOT_FOUND, '房源不存在')
  if (l.status !== 'online') fail(409, CODES.LISTING_LOCKED, '房源当前不可租（已下架或已锁定）')
  const months = Number(body.months)
  if (!(months >= 1 && months <= 24)) bad('租期必须在 1-24 个月之间', [{ field: 'months', message: '范围 1-24' }])
  const checkIn = Date.parse(body.check_in_date)
  const tomorrow = S.now + 24 * 3600 * 1000
  const limit = S.now + 90 * 24 * 3600 * 1000
  if (!Number.isFinite(checkIn) || checkIn < tomorrow || checkIn > limit) {
    bad('入住日期需在次日到 90 天之间', [{ field: 'check_in_date', message: '超出允许范围' }])
  }
  const lockedByOther = S.orders.some((o) => o.listingId === l.id && ['pending', 'confirmed'].includes(o.status))
  if (lockedByOther) fail(409, CODES.LISTING_LOCKED, '该房源已被其他订单锁定')

  const serviceFee = Math.round(l.rent * l.serviceFeeRate * months)
  const id = nextId('order')
  const order = {
    id,
    orderNo: fmtOrderNo(id),
    tenantId: u.id,
    merchantId: l.merchantId,
    listingId: l.id,
    rent: l.rent,
    months,
    deposit: l.deposit,
    serviceFee,
    totalAmount: l.rent * months + l.deposit + serviceFee,
    checkInDate: body.check_in_date,
    status: 'pending',
    snapshot: { version: 1, title: l.title, layout: `${l.rooms}室${l.halls}厅`, regionName: regionName(l.regionCode), cover: l.images?.[0]?.key ?? '' },
    createdAt: nowIso(),
    confirmedAt: null,
    completedAt: null,
    closedAt: null,
    reason: null,
  }
  S.orders.push(order)
  S.orderLogs.push({ id: nextId('log'), orderId: id, fromStatus: null, toStatus: 'pending', operatorId: u.id, reason: null, createdAt: nowIso() })
  l.status = 'locked'
  pushNotice(l.merchantId, 'order', '收到新订单', `订单 ${order.orderNo} 待你确认（${l.title}）。`, 'order', id)
  return { status: 201, body: orderDto(order, true) }
}

api['GET /api/v1/orders'] = async ({ req, q }) => {
  const u = currentUser(req)
  const tab = q.get('tab')
  let rows = S.orders.filter((o) => (u.role === 'merchant' ? o.merchantId === u.id : o.tenantId === u.id))
  if (tab && tab !== 'all') rows = rows.filter((o) => o.status === tab)
  rows = rows.sort((a, b) => b.id - a.id)
  const paged = page(rows, q, (o) => `${o.id}`)
  const counts = {}
  const scope = S.orders.filter((o) => (u.role === 'merchant' ? o.merchantId === u.id : o.tenantId === u.id))
  const base = { all: scope.length, pending: 0, confirmed: 0, completed: 0, rejected: 0, cancelled: 0 }
  for (const o of scope) base[o.status] = (base[o.status] || 0) + 1
  Object.assign(counts, base)
  return { body: { items: paged.items.map((o) => ({ ...orderDto(o, true), listing_title: o.snapshot?.title ?? '', cover: `/mock-files/${o.snapshot?.cover ?? ''}` })), next_cursor: paged.next_cursor, counts } }
}

api['GET /api/v1/orders/:id'] = async ({ req, params }) => {
  const u = currentUser(req)
  const o = S.orders.find((x) => x.id === Number(params.id) || x.orderNo === params.id)
  if (!o) fail(404, CODES.NOT_FOUND, '订单不存在')
  if (o.tenantId !== u.id && o.merchantId !== u.id && u.role !== 'admin') fail(403, CODES.ROLE_FORBIDDEN, '无权查看该订单')
  return { body: orderDto(o, true) }
}

function transition({ req, params, to, allowedFrom, actor, extra = {}, onAfter }) {
  const o = S.orders.find((x) => x.id === Number(params.id) || x.orderNo === params.id)
  if (!o) fail(404, CODES.NOT_FOUND, '订单不存在')
  if (actor === 'merchant' && o.merchantId !== req.user.id) fail(403, CODES.ROLE_FORBIDDEN, '只能操作自己店铺的订单')
  if (actor === 'tenant' && o.tenantId !== req.user.id) fail(403, CODES.ROLE_FORBIDDEN, '只能操作自己的订单')
  if (!allowedFrom.includes(o.status)) fail(409, CODES.ORDER_STATE_INVALID, `订单当前状态（${o.status}）不允许该操作`)
  const from = o.status
  o.status = to
  if (to === 'confirmed') o.confirmedAt = nowIso()
  if (to === 'completed') o.completedAt = nowIso()
  if (['rejected', 'cancelled'].includes(to)) o.closedAt = nowIso()
  if (extra.reason) o.reason = extra.reason
  S.orderLogs.push({ id: nextId('log'), orderId: o.id, fromStatus: from, toStatus: to, operatorId: req.user.id, reason: extra.reason ?? null, createdAt: nowIso() })
  onAfter?.(o)
  return { body: orderDto(o, true) }
}

api['POST /api/v1/orders/:id/confirm'] = async ({ req, params }) => {
  req.user = currentUser(req, { role: 'merchant' })
  return transition({
    req, params, to: 'confirmed', allowedFrom: ['pending'], actor: 'merchant',
    onAfter: (o) => pushNotice(o.tenantId, 'order', '商家已接单', `商家已确认你的订单 ${o.orderNo}，房源已为你锁定。`, 'order', o.id),
  })
}

api['POST /api/v1/orders/:id/reject'] = async ({ req, params, body }) => {
  req.user = currentUser(req, { role: 'merchant' })
  const reason = String(body.reason || '').trim()
  if (!reason) bad('请填写拒单原因', [{ field: 'reason', message: '必填' }])
  if (reason.length > 100) bad('拒单原因不能超过 100 字', [{ field: 'reason', message: '过长' }])
  return transition({
    req, params, to: 'rejected', allowedFrom: ['pending'], actor: 'merchant', extra: { reason },
    onAfter: (o) => {
      const l = listingById(o.listingId)
      if (l && l.status === 'locked') l.status = 'online'
      pushNotice(o.tenantId, 'order', '商家已拒单', `订单 ${o.orderNo} 被拒：${reason}`, 'order', o.id)
    },
  })
}

api['POST /api/v1/orders/:id/complete'] = async ({ req, params }) => {
  req.user = currentUser(req, { role: 'merchant' })
  return transition({
    req, params, to: 'completed', allowedFrom: ['confirmed'], actor: 'merchant',
    onAfter: (o) => {
      const l = listingById(o.listingId)
      if (l) l.status = 'rented'
      pushNotice(o.tenantId, 'order', '订单已完成', `订单 ${o.orderNo} 已完成，祝入住愉快。`, 'order', o.id)
    },
  })
}

api['POST /api/v1/orders/:id/cancel'] = async ({ req, params, body }) => {
  req.user = currentUser(req)
  if (req.user.role !== 'tenant' && req.user.role !== 'admin') fail(403, CODES.ROLE_FORBIDDEN, '只有租客可以取消订单')
  const reason = body?.reason ? String(body.reason).slice(0, 100) : null
  return transition({
    req, params, to: 'cancelled', allowedFrom: ['pending', 'confirmed'], actor: 'tenant', extra: { reason },
    onAfter: (o) => {
      const l = listingById(o.listingId)
      if (l && l.status === 'locked') l.status = 'online'
      pushNotice(o.merchantId, 'order', '租客取消订单', `订单 ${o.orderNo} 已被租客取消。`, 'order', o.id)
    },
  })
}

/* ---------- 支付 ---------- */
api['POST /api/v1/orders/:id/pay'] = async ({ req, params }) => {
  const u = currentUser(req, { role: 'tenant' })
  const key = req.headers['idempotency-key']
  if (!key) fail(400, CODES.IDEMPOTENCY_KEY_REQUIRED, '支付请求必须带 Idempotency-Key 请求头')
  const o = S.orders.find((x) => x.id === Number(params.id) || x.orderNo === params.id)
  if (!o) fail(404, CODES.NOT_FOUND, '订单不存在')
  if (o.tenantId !== u.id) fail(403, CODES.ROLE_FORBIDDEN, '只能支付自己的订单')
  if (!['pending', 'confirmed'].includes(o.status)) fail(409, CODES.ORDER_STATE_INVALID, '当前状态不可支付')
  const prev = S.idempotency.get(key)
  if (prev) {
    if (prev.orderId !== o.id) fail(409, CODES.IDEMPOTENCY_CONFLICT, '同一 Idempotency-Key 不能用于不同订单')
    return { body: prev.payment }
  }
  const paid = S.payments.some((p) => p.orderId === o.id && p.type === 'pay')
  if (paid) fail(409, CODES.CONFLICT, '该订单已支付，请勿重复支付')
  const payment = {
    id: nextId('payment'),
    order_id: o.id,
    type: 'pay',
    amount: o.totalAmount,
    trade_no: `MOCK${Date.now()}${nextId('payment')}`,
    created_at: nowIso(),
  }
  S.payments.push({ id: payment.id, orderId: o.id, type: 'pay', amount: payment.amount, status: 'success', tradeNo: payment.trade_no, createdAt: payment.created_at })
  S.idempotency.set(key, { orderId: o.id, payment })
  pushNotice(o.merchantId, 'order', '租客已支付', `订单 ${o.orderNo} 已支付 ${yuan(o.totalAmount)} 元。`, 'order', o.id)
  return { status: 201, body: payment }
}

api['GET /api/v1/orders/:id/payments'] = async ({ req, params, q }) => {
  const u = currentUser(req)
  const o = S.orders.find((x) => x.id === Number(params.id) || x.orderNo === params.id)
  if (!o) fail(404, CODES.NOT_FOUND, '订单不存在')
  if (o.tenantId !== u.id && o.merchantId !== u.id && u.role !== 'admin') fail(403, CODES.ROLE_FORBIDDEN, '无权查看')
  const rows = S.payments
    .filter((p) => p.orderId === o.id)
    .map((p) => ({ id: p.id, order_id: p.orderId, type: p.type, amount: p.amount, trade_no: p.tradeNo, created_at: p.createdAt }))
    .sort((a, b) => b.id - a.id)
  const paged = page(rows, q, (p) => `${p.id}`)
  return { body: paged }
}

/* ---------- 通知 ---------- */
api['GET /api/v1/notifications'] = async ({ req, q }) => {
  const u = currentUser(req)
  let rows = S.notifications.filter((n) => n.userId === u.id)
  if (q.get('is_read') === 'false') rows = rows.filter((n) => !n.isRead)
  if (q.get('is_read') === 'true') rows = rows.filter((n) => n.isRead)
  rows.sort((a, b) => b.id - a.id)
  const paged = page(rows, q, (n) => `${n.id}`)
  return { body: { items: paged.items.map(noticeDto), next_cursor: paged.next_cursor, unread: S.notifications.filter((n) => n.userId === u.id && !n.isRead).length } }
}

api['POST /api/v1/notifications/:id/read'] = async ({ req, params }) => {
  const u = currentUser(req)
  const n = S.notifications.find((x) => x.id === Number(params.id) && x.userId === u.id)
  if (!n) fail(404, CODES.NOT_FOUND, '通知不存在')
  n.isRead = true
  return { status: 204 }
}

api['POST /api/v1/notifications/read-all'] = async ({ req }) => {
  const u = currentUser(req)
  for (const n of S.notifications) if (n.userId === u.id) n.isRead = true
  return { status: 204 }
}

/* ---------- AI（SSE） ---------- */
const AI_WORDS = {
  region: () => seed.REGIONS.map((r) => ({ code: r.code, name: r.name })),
  rooms: () => [1, 2, 3, 4, 5],
}

function extractConditions(text) {
  const t = String(text || '')
  const cond = {}
  for (const r of seed.REGIONS) if (t.includes(r.name) || t.includes(r.name.replace(/[区市县]$/, ''))) cond.region = r.code
  const m = t.match(/(\d)\s*(室|居|房)/)
  if (m) cond.rooms = Number(m[1])
  const rent = t.match(/(\d+(?:\.\d+)?)\s*(k|千|万)?\s*(元|以内|\/月|每月)/i)
  if (rent) {
    const n = Number(rent[1])
    const unit = rent[2]
    cond.rentMax = unit === '万' ? Math.round(n * 1000000) : unit ? Math.round(n * 100000) : Math.round(n * 100)
  }
  if (/有电梯|电梯房/.test(t)) cond.hasElevator = true
  if (/近地铁|地铁沿线/.test(t)) cond.nearMetro = true
  return cond
}

function aiSearch(cond) {
  let items = S.listings.filter((l) => l.status === 'online')
  if (cond.region) items = items.filter((l) => l.regionCode === cond.region)
  if (cond.rooms) items = items.filter((l) => l.rooms === cond.rooms)
  if (cond.rentMax) items = items.filter((l) => l.rent <= cond.rentMax)
  if (cond.hasElevator) items = items.filter((l) => l.hasElevator)
  if (cond.nearMetro) items = items.filter((l) => l.metroLine && (l.walkMinutes ?? 99) <= 10)
  return items
}

api['POST /api/v1/ai/chat'] = async ({ req, body, res }) => {
  const u = currentUser(req)
  const scene = body.scene || 'find_house'
  if (!['find_house', 'merchant_copy'].includes(scene)) bad('scene 取值不合法')
  const message = String(body.message || '').trim()
  if (!message) bad('消息不能为空')

  let session = body.session_id ? S.aiSessions.find((s) => s.id === Number(body.session_id) && s.userId === u.id) : null
  if (!session) {
    session = { id: nextId('session'), userId: u.id, scene, context: {}, createdAt: nowIso(), updatedAt: nowIso() }
    S.aiSessions.push(session)
  }
  const userMsg = { id: nextId('message'), sessionId: session.id, role: 'user', content: message, payload: {}, createdAt: nowIso() }
  S.aiMessages.push(userMsg)

  const cond = extractConditions(message)
  const merged = { ...session.context, ...cond }
  session.context = merged
  session.updatedAt = nowIso()
  const found = aiSearch(merged)

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))

  let text = ''
  if (found.length) {
    const bits = []
    if (merged.region) bits.push(regionName(merged.region))
    if (merged.rooms) bits.push(`${merged.rooms} 室`)
    if (merged.rentMax) bits.push(`≤${yuan(merged.rentMax)} 元`)
    if (merged.hasElevator) bits.push('有电梯')
    text = bits.length ? `按「${bits.join(' · ')}」为你找到 ${found.length} 套房源。` : `为你找到 ${found.length} 套在租房源。`
  } else {
    text = '没有完全符合条件的房源。要不要放宽一个条件？比如把预算提高一些，或换成相邻区域。'
  }

  for (const chunk of text.match(/.{1,8}/g) ?? []) {
    send('delta', { text: chunk })
    if (SSE_DELAY) await wait(SSE_DELAY)
  }
  send('conditions', merged)
  if (!cond.region && !merged.region) {
    send('options', {
      group: '区域',
      items: seed.REGIONS.slice(0, 4).map((r) => ({ label: `${r.name} · ${S.listings.filter((l) => l.regionCode === r.code && l.status === 'online').length} 套`, value: r.name })),
    })
  }
  send('cards', { items: found.slice(0, 5).map(listingCard) })
  const done = { session_id: session.id, message_id: userMsg.id + 1 }
  S.aiMessages.push({ id: nextId('message'), sessionId: session.id, role: 'assistant', content: text, payload: { conditions: merged, cards: found.map((l) => l.id) }, createdAt: nowIso() })
  send('done', { session_id: session.id, message_id: S.aiMessages[S.aiMessages.length - 1].id })
  res.end()
  return { handled: true, meta: done }
}

api['GET /api/v1/ai/sessions/:id/messages'] = async ({ req, params }) => {
  const u = currentUser(req)
  const s = S.aiSessions.find((x) => x.id === Number(params.id) && x.userId === u.id)
  if (!s) fail(404, CODES.NOT_FOUND, '会话不存在')
  return {
    body: {
      items: S.aiMessages.filter((m) => m.sessionId === s.id).map((m) => ({ role: m.role, content: m.content, payload: m.payload, created_at: m.createdAt })),
      context: s.context,
    },
  }
}

/* ==========================================================================
 * 参考价：口径降级 + 样本不足的默认行为
 *
 * 规则（与 docs/price-reference.md 一致）：
 *   口径序列  region+rooms+area → region+rooms → region → city
 *   每级取「在架、未软删、排除自身」的样本数 sample_count
 *   命中第一个 sample_count >= MOCK_PRICE_MIN_SAMPLE(默认 3) 的口径；
 *   全都不到 → insufficient = true，range 返回 null（**不给假区间**），
 *   relaxed = true，note 明确写「样本不足」。
 *   中位数/分位数结果按口径缓存（生产用 Redis，假后端用进程内 Map + TTL 扮演）。
 * ========================================================================== */

const PRICE_MIN_SAMPLE = 3
const PRICE_CACHE_TTL = 6 * 3600 * 1000
const AREA_BUCKETS = [
  { key: 'lt50', min: 0, max: 50 },
  { key: '50_70', min: 50, max: 70 },
  { key: '70_90', min: 70, max: 90 },
  { key: '90_120', min: 90, max: 120 },
  { key: 'gte120', min: 120, max: Infinity },
]
const areaBucketOf = (area) => AREA_BUCKETS.find((b) => area >= b.min && area < b.max)?.key ?? 'gte120'

/* 进程内 Map 扮演 Redis（默认 6 小时过期） */
const priceCache = new Map()
function priceCacheGet(key) {
  const hit = priceCache.get(key)
  if (!hit) return null
  if (hit.expire < Date.now()) {
    priceCache.delete(key)
    return null
  }
  return hit.value
}
function priceCacheSet(key, value) {
  priceCache.set(key, { value, expire: Date.now() + PRICE_CACHE_TTL })
  return value
}

const SCOPE_LABEL = {
  'region+rooms+area': '区域 + 户型 + 面积段',
  'region+rooms': '区域 + 户型',
  region: '区域',
  city: '全市',
}

api['POST /api/v1/ai/price-reference'] = async ({ req, body }) => {
  currentUser(req)

  let target = null
  let regionCode = body.region_code ?? null
  let rooms = body.rooms ? Number(body.rooms) : null
  let area = body.area ? Number(body.area) : null

  if (body.listing_id) {
    target = listingById(body.listing_id)
    if (!target) fail(404, CODES.NOT_FOUND, '房源不存在')
    regionCode = target.regionCode
    rooms = target.rooms
    area = Number(target.area)
  } else if (!regionCode && !rooms && !area) {
    bad('请提供 listing_id，或 region_code / rooms / area 中的至少一项')
  }

  const minSample = Number(process.env.MOCK_PRICE_MIN_SAMPLE || PRICE_MIN_SAMPLE)
  const pool = S.listings.filter((l) => l.status !== 'offline' && !l.deletedAt && (!target || l.id !== target.id))

  /* 候选口径：从精确到宽泛 */
  const candidates = []
  if (regionCode && rooms != null && area != null) {
    candidates.push({
      scope: 'region+rooms+area',
      rows: pool.filter((l) => l.regionCode === regionCode && l.rooms === rooms && areaBucketOf(Number(l.area)) === areaBucketOf(area)),
    })
  }
  if (regionCode && rooms != null) {
    candidates.push({ scope: 'region+rooms', rows: pool.filter((l) => l.regionCode === regionCode && l.rooms === rooms) })
  }
  if (regionCode) candidates.push({ scope: 'region', rows: pool.filter((l) => l.regionCode === regionCode) })
  candidates.push({ scope: 'city', rows: pool })

  const hit = candidates.find((c) => c.rows.length >= minSample) ?? null
  const insufficient = !hit
  const used = hit ?? candidates[candidates.length - 1]
  const relaxed = insufficient || used.scope !== candidates[0].scope

  const cacheKey = `price:${used.scope}:${regionCode ?? '-'}:${rooms ?? '-'}:${area != null ? areaBucketOf(area) : '-'}:${minSample}`
  const cached = priceCacheGet(cacheKey)

  const buildPeers = (rows) =>
    rows
      .slice()
      .sort((a, b) => (area != null ? Math.abs(Number(a.area) - area) - Math.abs(Number(b.area) - area) : a.id - b.id))
      .slice(0, 5)
      .map((l) => ({
        title: l.title,
        area: Number(l.area),
        decoration: seed.DECORATIONS.find((d) => d.code === l.decoration)?.name ?? '',
        rent: l.rent,
      }))

  if (cached) {
    return { body: cached, headers: { 'X-Price-Cache': 'hit' } }
  }

  const sample = used.rows.map((l) => l.rent)
  const payload = {
    range: insufficient ? null : percentile(sample),
    sample_count: sample.length,
    relaxed,
    scope: used.scope,
    scope_label: SCOPE_LABEL[used.scope] ?? used.scope,
    insufficient,
    min_sample: minSample,
    peers: insufficient ? [] : buildPeers(used.rows),
    note: insufficient
      ? `样本不足（当前口径「${SCOPE_LABEL[used.scope]}」仅 ${sample.length} 条，少于 ${minSample} 条），暂不给出参考价。`
      : `口径「${SCOPE_LABEL[used.scope]}」，样本 ${sample.length} 条。`,
  }
  priceCacheSet(cacheKey, payload)
  return { body: payload, headers: { 'X-Price-Cache': 'miss' } }
}

function percentile(values) {
  const arr = [...values].sort((a, b) => a - b)
  if (!arr.length) return null
  const at = (p) => arr[Math.min(arr.length - 1, Math.floor((arr.length - 1) * p))]
  return { min: arr[0], max: arr[arr.length - 1], median: at(0.5), p25: at(0.25), p75: at(0.75) }
}

api['POST /api/v1/ai/copy'] = async ({ req, body }) => {
  const u = currentUser(req, { role: 'merchant' })
  requireFields(body, ['listing_id', 'field'])
  const l = listingById(body.listing_id)
  if (!l) fail(404, CODES.NOT_FOUND, '房源不存在')
  if (l.merchantId !== u.id) fail(403, CODES.ROLE_FORBIDDEN, '只能为自己的房源生成文案')
  const area = Number(l.area)
  const base = [
    `${regionName(l.regionCode)}${l.community ? ` · ${l.community}` : ''} ${l.rooms}室${l.halls}厅 · ${area}㎡ · ${l.hasElevator ? '有电梯' : '无电梯'}`,
    `${area}㎡ ${l.rooms}室${l.halls}厅，${l.metroLine ? `距 ${l.metroLine} 号线步行 ${l.walkMinutes} 分钟` : '交通便利'}，${l.decoration === 'fine' ? '精装修' : '简装'}，月租 ${yuan(l.rent)} 元。`,
    `【${l.title}】${area}㎡ · ${l.rooms}室${l.halls}厅 · ${l.orientation ?? '朝向优'} · 可入住 ${l.availableDate}，押金 ${yuan(l.deposit)} 元。`,
  ]
  if (body.field === 'title') {
    return { body: { candidates: [l.title, `${l.community || regionName(l.regionCode)} ${l.rooms}室${l.halls}厅 ${area}㎡`, `${regionName(l.regionCode)}${l.hasElevator ? '电梯' : ''}${l.rooms}居 ${yuan(l.rent)}元`].map((text) => ({ text, valid: true })) } }
  }
  return { body: { candidates: base.map((text) => ({ text, valid: true })) } }
}

/* ---------- 管理员 ---------- */
api['GET /api/v1/admin/qualifications'] = async ({ req, q }) => {
  currentUser(req, { role: 'admin' })
  let rows = [...S.qualifications]
  const status = q.get('status')
  if (status) rows = rows.filter((x) => x.status === status)
  rows.sort((a, b) => String(b.submittedAt ?? '').localeCompare(String(a.submittedAt ?? '')))
  return {
    body: {
      items: rows.map((x) => ({
        id: x.id,
        merchant_name: userById(x.userId)?.nickname ?? '',
        legal_name: x.legalName,
        status: x.status,
        files: x.files.map((f) => ({ id: f.id, url: `/mock-files/${f.objectKey}`, file_name: f.fileName })),
        submitted_at: x.submittedAt,
        reviewed_at: x.reviewedAt,
        reject_reason: x.rejectReason,
      })),
    },
  }
}

api['POST /api/v1/admin/qualifications/:id/approve'] = async ({ req, params }) => {
  const admin = currentUser(req, { role: 'admin' })
  const q = S.qualifications.find((x) => x.id === Number(params.id))
  if (!q) fail(404, CODES.NOT_FOUND, '资质不存在')
  if (q.status !== 'pending') fail(409, CODES.CONFLICT, '只有待审核的资质可以操作')
  q.status = 'approved'
  q.reviewedAt = nowIso()
  q.reviewerId = admin.id
  q.rejectReason = null
  S.reviews.push({ id: nextId('review'), qualificationId: q.id, reviewerId: admin.id, action: 'approve', reason: null, createdAt: nowIso() })
  pushNotice(q.userId, 'system', '资质审核通过', '你的商家资质已通过审核，可以上架房源了。')
  return { body: { id: q.id, status: q.status } }
}

api['POST /api/v1/admin/qualifications/:id/reject'] = async ({ req, params, body }) => {
  const admin = currentUser(req, { role: 'admin' })
  const reason = String(body.reason || '').trim()
  if (reason.length < 10) bad('驳回原因不少于 10 个字', [{ field: 'reason', message: '至少 10 个字' }])
  const q = S.qualifications.find((x) => x.id === Number(params.id))
  if (!q) fail(404, CODES.NOT_FOUND, '资质不存在')
  if (q.status !== 'pending') fail(409, CODES.CONFLICT, '只有待审核的资质可以操作')
  q.status = 'rejected'
  q.reviewedAt = nowIso()
  q.reviewerId = admin.id
  q.rejectReason = reason
  S.reviews.push({ id: nextId('review'), qualificationId: q.id, reviewerId: admin.id, action: 'reject', reason, createdAt: nowIso() })
  pushNotice(q.userId, 'system', '资质被驳回', `驳回原因：${reason}`)
  return { body: { id: q.id, status: q.status, reject_reason: reason } }
}

api['GET /api/v1/admin/listings'] = async ({ req, q }) => {
  currentUser(req, { role: 'admin' })
  const keyword = (q.get('keyword') || '').trim().toLowerCase()
  const status = q.get('status')
  let rows = S.listings.filter((l) => !l.deletedAt)
  if (keyword) rows = rows.filter((l) => l.title.toLowerCase().includes(keyword) || String(l.community || '').toLowerCase().includes(keyword))
  if (status) rows = rows.filter((l) => l.status === status)
  rows = rows.sort((a, b) => b.id - a.id)
  return {
    body: {
      items: rows.map((l) => ({
        id: l.id,
        title: l.title,
        merchant_name: userById(l.merchantId)?.nickname ?? '',
        region_name: regionName(l.regionCode),
        rent: l.rent,
        status: l.status,
        published_at: l.publishedAt,
      })),
    },
  }
}

api['POST /api/v1/admin/listings/:id/offline'] = async ({ req, params, body }) => {
  currentUser(req, { role: 'admin' })
  const reason = String(body.reason || '').trim()
  if (!reason) bad('请填写下架原因', [{ field: 'reason', message: '必填' }])
  const l = listingById(params.id)
  if (!l) fail(404, CODES.NOT_FOUND, '房源不存在')
  l.status = 'offline'
  pushNotice(l.merchantId, 'listing', '房源被管理员下架', `${l.title} 已被下架：${reason}`, 'listing', l.id)
  return { body: { id: l.id, status: l.status } }
}

api['GET /api/v1/admin/users'] = async ({ req, q }) => {
  currentUser(req, { role: 'admin' })
  const keyword = (q.get('keyword') || '').trim().toLowerCase()
  let rows = S.users.filter((u) => u.role !== 'admin')
  if (keyword) rows = rows.filter((u) => u.account.toLowerCase().includes(keyword) || u.nickname.toLowerCase().includes(keyword))
  rows = rows.sort((a, b) => a.id - b.id)
  return {
    body: {
      items: rows.map((u) => ({ id: u.id, account: u.account, role: u.role, nickname: u.nickname, status: u.status, created_at: u.createdAt })),
    },
  }
}

api['POST /api/v1/admin/users/:id/disable'] = async ({ req, params, body }) => {
  currentUser(req, { role: 'admin' })
  const reason = String(body.reason || '').trim()
  if (!reason) bad('请填写禁用原因', [{ field: 'reason', message: '必填' }])
  const u = userById(Number(params.id))
  if (!u) fail(404, CODES.NOT_FOUND, '用户不存在')
  if (u.role === 'admin') fail(403, CODES.ROLE_FORBIDDEN, '不能禁用管理员账号')
  u.status = 'disabled'
  for (const l of S.listings) if (l.merchantId === u.id && l.status === 'online') l.status = 'offline'
  return { body: { id: u.id, status: u.status } }
}

api['POST /api/v1/admin/users/:id/enable'] = async ({ req, params }) => {
  currentUser(req, { role: 'admin' })
  const u = userById(Number(params.id))
  if (!u) fail(404, CODES.NOT_FOUND, '用户不存在')
  u.status = 'active'
  return { body: { id: u.id, status: u.status } }
}

/* ---------- 商家侧汇总（供前端顶栏） ---------- */
// 文档 5.2 只给了公开的 /listings 与写接口，商家查看自己的全部房源没有对应接口，
// 这里按常见做法补充（README 已标注为契约补充，真后端需对齐）
api['GET /api/v1/merchant/listings'] = async ({ req, q }) => {
  const u = currentUser(req, { role: 'merchant' })
  const status = q.get('status')
  const keyword = (q.get('keyword') || '').trim().toLowerCase()
  let rows = S.listings.filter((l) => l.merchantId === u.id && !l.deletedAt)
  if (status && status !== 'all') rows = rows.filter((l) => l.status === status)
  if (keyword) rows = rows.filter((l) => l.title.toLowerCase().includes(keyword))
  rows.sort((a, b) => b.id - a.id)
  return {
    body: {
      items: rows.map((l) => ({
        ...listingCard(l),
        status: l.status,
        view_count: l.viewCount,
        favorite_count: S.favorites.filter((f) => f.listingId === l.id).length,
        published_at: l.publishedAt,
      })),
      counts: {
        all: S.listings.filter((l) => l.merchantId === u.id && !l.deletedAt).length,
        online: S.listings.filter((l) => l.merchantId === u.id && l.status === 'online').length,
        offline: S.listings.filter((l) => l.merchantId === u.id && l.status === 'offline').length,
        locked: S.listings.filter((l) => l.merchantId === u.id && l.status === 'locked').length,
        rented: S.listings.filter((l) => l.merchantId === u.id && l.status === 'rented').length,
      },
    },
  }
}

api['GET /api/v1/merchant/summary'] = async ({ req }) => {
  const u = currentUser(req, { role: 'merchant' })
  const mine = S.listings.filter((l) => l.merchantId === u.id && !l.deletedAt)
  const orders = S.orders.filter((o) => o.merchantId === u.id)
  return {
    body: {
      listings: mine.length,
      online: mine.filter((l) => l.status === 'online').length,
      pending_orders: orders.filter((o) => o.status === 'pending').length,
      qualification_status: S.qualifications.find((q) => q.userId === u.id)?.status ?? 'not_submitted',
    },
  }
}

api['GET /api/v1/merchant/qualification'] = async ({ req }) => {
  const u = currentUser(req, { role: 'merchant' })
  const q = S.qualifications.find((x) => x.userId === u.id)
  return {
    body: q
      ? {
          id: q.id,
          legal_name: q.legalName,
          status: q.status,
          files: q.files.map((f) => ({ id: f.id, url: `/mock-files/${f.objectKey}`, file_name: f.fileName })),
          submitted_at: q.submittedAt,
          reviewed_at: q.reviewedAt,
          reject_reason: q.rejectReason,
        }
      : { status: 'not_submitted', files: [] },
  }
}

api['PUT /api/v1/merchant/qualification'] = async ({ req, body }) => {
  const u = currentUser(req, { role: 'merchant' })
  requireFields(body, ['legal_name'])
  if (String(body.legal_name).trim().length < 2) bad('主体名称至少 2 个字', [{ field: 'legal_name', message: '过短' }])
  const files = Array.isArray(body.files) ? body.files : []
  if (!files.length) bad('请至少上传 1 张资质材料', [{ field: 'files', message: '至少 1 张' }])
  let q = S.qualifications.find((x) => x.userId === u.id)
  if (!q) {
    q = { id: S.qualifications.length + 1, userId: u.id, legalName: '', status: 'not_submitted', submittedAt: null, reviewedAt: null, reviewerId: null, rejectReason: null, files: [] }
    S.qualifications.push(q)
  }
  q.legalName = String(body.legal_name).trim()
  q.files = files.map((objectKey, i) => ({ id: 1000 + i, objectKey, fileName: String(objectKey).split('/').pop() }))
  q.status = 'pending'
  q.submittedAt = nowIso()
  q.reviewedAt = null
  q.rejectReason = null
  return { body: { id: q.id, status: q.status } }
}

/* ==========================================================================
 * 测试钩子（真后端没有）
 * ========================================================================== */
const hooks = {
  'POST /__mock__/reset': async () => {
    S = createState()
    priceCache.clear()
    return { body: { ok: true, now: new Date(S.now).toISOString() } }
  },
  /**
   * 补充样本：批量造在架房源，用来验证「样本充足后参考价从 insufficient 变成正常」
   * body: { count?, region_code?, rooms?, area?, rent? }
   */
  'POST /__mock__/listings/bulk': async ({ body }) => {
    const count = Math.min(Math.max(Number(body.count ?? 5), 1), 200)
    const regionCode = body.region_code ?? 'shahekou'
    const rooms = Number(body.rooms ?? 2)
    const area = Number(body.area ?? 86)
    const rent = Number(body.rent ?? 320000)
    const created = []
    for (let i = 0; i < count; i++) {
      const id = nextId('listing')
      S.listings.push({
        id,
        merchantId: 2,
        title: `样本房源 ${id}`,
        description: '假后端批量生成的样本数据，用于验证价格统计与分位数缓存。',
        regionCode,
        community: '样本小区',
        address: `大连市样本路 ${id} 号`,
        metroLine: '1',
        walkMinutes: 6,
        rooms,
        halls: 1,
        baths: 1,
        area,
        floor: 6,
        totalFloor: 18,
        orientation: 'south',
        decoration: 'fine',
        houseType: 'apartment',
        rentType: 'whole',
        hasElevator: true,
        facilities: { bed: ['bed', 'ac'], public: ['elevator', 'wifi'] },
        rent: rent + i * 5000,
        deposit: rent + i * 5000,
        serviceFeeRate: 0.05,
        status: 'online',
        publishedAt: nowIso(),
        viewCount: 0,
        favoriteCount: 0,
        availableDate: '2026-12-01',
        minLeaseMonths: 6,
        createdAt: nowIso(),
        images: [{ key: `listing/${id}-1.jpg`, sort: 0, isCover: true }],
      })
      created.push(id)
    }
    priceCache.clear()
    return { body: { created, count: created.length } }
  },
  'GET /__mock__/state': async () => ({
    body: {
      now: new Date(S.now).toISOString(),
      listings: S.listings.map((l) => ({ id: l.id, status: l.status, merchantId: l.merchantId, rent: l.rent })),
      orders: S.orders.map((o) => ({ id: o.id, no: o.orderNo, status: o.status, listingId: o.listingId })),
      payments: S.payments.map((p) => ({ id: p.id, orderId: p.orderId, type: p.type, amount: p.amount })),
      notifications: S.notifications.map((n) => ({ id: n.id, userId: n.userId, isRead: n.isRead })),
      qualifications: S.qualifications.map((q) => ({ id: q.id, userId: q.userId, status: q.status })),
      users: S.users.map((u) => ({ id: u.id, account: u.account, role: u.role, status: u.status })),
      idempotencyKeys: [...S.idempotency.keys()],
    },
  }),
  'POST /__mock__/tick': async ({ q }) => {
    const days = Number(q.get('days') || 1)
    S.now += days * 24 * 3600 * 1000
    // 超期未接单（>48h）自动关闭，模拟定时任务
    let closed = 0
    for (const o of S.orders) {
      if (o.status !== 'pending') continue
      if (S.now - Date.parse(o.createdAt) > 48 * 3600 * 1000) {
        o.status = 'cancelled'
        o.closedAt = nowIso()
        o.reason = '超期未接单，系统自动关闭'
        const l = listingById(o.listingId)
        if (l && l.status === 'locked') l.status = 'online'
        closed += 1
      }
    }
    return { body: { ok: true, now: new Date(S.now).toISOString(), autoClosedOrders: closed } }
  },
}

/* ==========================================================================
 * 路由与传输
 * ========================================================================== */

const ROUTES = [
  ...Object.keys(api).map((k) => {
    const [method, pattern] = k.split(' ')
    return { method, pattern, handler: api[k] }
  }),
  ...Object.keys(hooks).map((k) => {
    const [method, pattern] = k.split(' ')
    return { method, pattern, handler: hooks[k] }
  }),
]

function match(method, pathname) {
  for (const r of ROUTES) {
    if (r.method !== method) continue
    const p = r.pattern.split('/')
    const parts = pathname.split('/')
    if (p.length !== parts.length) continue
    const params = {}
    let ok = true
    for (let i = 0; i < p.length; i++) {
      if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(parts[i])
      else if (p[i] !== parts[i]) { ok = false; break }
    }
    if (ok) return { handler: r.handler, params }
  }
  return null
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' }

function svgPlaceholder(key) {
  const hue = [...String(key)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 17)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue},42%,92%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},38%,80%)"/>
  </linearGradient></defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <text x="60" y="740" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="34" fill="hsl(${hue},30%,32%)">${String(key).slice(0, 42)}</text>
</svg>`
}

function sendJson(res, status, body, extraHeaders = {}) {
  const buf = Buffer.from(JSON.stringify(body))
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length, ...extraHeaders })
  res.end(buf)
}

async function handle(req, res, traceId) {
  const url = new URL(req.url, 'http://mock.local')
  const pathname = decodeURIComponent(url.pathname)

  if (pathname.startsWith('/mock-files/')) {
    const key = pathname.slice('/mock-files/'.length)
    const svg = svgPlaceholder(key)
    res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-cache' })
    res.end(svg)
    return
  }

  if (pathname === '/__mock__/health') {
    sendJson(res, 200, { ok: true, now: new Date(S.now).toISOString() })
    return
  }

  const route = match(req.method, pathname)
  if (!route) {
    sendJson(res, 404, { code: CODES.NOT_FOUND, message: `接口不存在：${req.method} ${pathname}`, details: null, trace_id: traceId })
    return
  }

  /* 故障注入：X-Mock-Fail / X-Mock-Delay */
  const failMode = req.headers['x-mock-fail']
  if (failMode === 'db-down') {
    sendJson(res, 500, { code: 'INTERNAL_ERROR', message: '数据库连接失败（mock 注入）', details: null, trace_id: traceId })
    return
  }
  const delay = Number(req.headers['x-mock-delay'] || 0)
  if (delay > 0) await new Promise((r) => setTimeout(r, Math.min(delay, 3000)))

  try {
    const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readJson(req) : {}
    const result = await route.handler({ req, res, params: route.params, q: url.searchParams, body })
    if (result?.handled) return
    if (result?.status === 204) {
      res.writeHead(204, { 'X-Trace-Id': traceId })
      res.end()
      return
    }
    sendJson(res, result?.status ?? 200, result?.body ?? {}, { 'X-Trace-Id': traceId, ...(result?.headers ?? {}) })
  } catch (err) {
    if (err instanceof ApiError) {
      sendJson(res, err.status, { code: err.code, message: err.message, details: err.details ?? null, trace_id: traceId })
      return
    }
    sendJson(res, 500, { code: 'INTERNAL_ERROR', message: err.message || '服务内部错误', details: null, trace_id: traceId })
  }
}

let activeServer = null

export async function startMockServer({ port = Number(process.env.PORT || 8787), quiet = false } = {}) {
  if (activeServer) return activeServer
  const server = createServer((req, res) => {
    const traceId = randomUUID()
    handle(req, res, traceId).catch((err) => {
      try {
        sendJson(res, 500, { code: 'INTERNAL_ERROR', message: err.message, details: null, trace_id: traceId })
      } catch { /* 响应已发出 */ }
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  activeServer = server
  if (!quiet) {
    console.log('')
    console.log(`  RentHub 假后端已启动：http://127.0.0.1:${port}`)
    console.log(`  契约前缀：/api/v1   测试钩子：/__mock__/{reset,state,tick,health}`)
    console.log(`  演示账号：xiaofs / xingchen / guanli（密码 renthub123）`)
    console.log('')
  }
  return server
}

export function stopMockServer() {
  return new Promise((resolve) => {
    if (!activeServer) return resolve()
    activeServer.close(() => {
      activeServer = null
      resolve()
    })
  })
}

/* 直接 `node mock/server.mjs` 时自动监听；被 Vite 插件 import 时不自动启动。
 * 注意：必须用 resolve 后的绝对路径比较 —— Node 会把 argv[1] 解析成平台分隔符的绝对路径，
 * 用 endsWith('mock/server.mjs') 在 Windows 上永远匹配不到（反斜杠）。
 */
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun && !process.env.VITEST) {
  startMockServer().catch((err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`端口 ${process.env.PORT || 8787} 已被占用：先停掉占用进程，或换 PORT=xxxx 启动`)
    } else {
      console.error('[mock] 启动失败：', err.message)
    }
    process.exit(1)
  })
}

export { CODES, MIME, createState as _createState }
