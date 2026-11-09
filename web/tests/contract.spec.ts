/**
 * L1 契约测试：直接对假后端打 HTTP，验证它「像真后端」
 *
 * 覆盖：错误体形状、鉴权、角色、游标分页、房源锁定、订单状态机、
 *      支付幂等、资质闸门、驳回原因校验、通知已读、SSE 事件序列、超期自动关闭。
 *
 * 这一层不启动浏览器，跑得很快，是 CI 的第一道门。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error 假后端是纯 JS（Node 内置 http），没有类型声明
import { startMockServer, stopMockServer } from '../mock/server.mjs'

let base = ''

interface ApiOptions {
  method?: string
  token?: string
  body?: unknown
  headers?: Record<string, string>
}

async function api(path: string, opts: ApiOptions = {}) {
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: res.status, data: data as Record<string, any>, text }
}

async function login(role: 'tenant' | 'merchant' | 'admin', account: string) {
  const res = await api('/api/v1/auth/login', { method: 'POST', body: { account, password: 'renthub123', role } })
  expect(res.status).toBe(200)
  return res.data.access_token as string
}

const TENANT = { role: 'tenant' as const, account: 'xiaofs' }
const MERCHANT = { role: 'merchant' as const, account: 'xingchen' }
const ADMIN = { role: 'admin' as const, account: 'guanli' }

beforeAll(async () => {
  const server = await startMockServer({ port: 0, quiet: true })
  base = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  await stopMockServer()
})

beforeEach(async () => {
  await api('/__mock__/reset', { method: 'POST' })
})

describe('错误契约', () => {
  it('未登录访问受保护接口返回 401 与统一错误体', async () => {
    const res = await api('/api/v1/orders')
    expect(res.status).toBe(401)
    expect(res.data).toMatchObject({ code: 'AUTH_TOKEN_MISSING' })
    expect(typeof res.data.message).toBe('string')
    expect(res.data).toHaveProperty('details')
    expect(res.data.trace_id).toMatch(/[0-9a-f-]{8,}/)
  })

  it('不存在的接口返回 404 + code', async () => {
    const res = await api('/api/v1/nope')
    expect(res.status).toBe(404)
    expect(res.data.code).toBe('NOT_FOUND')
  })

  it('参数校验失败返回 422 且 details 带字段名', async () => {
    const res = await api('/api/v1/auth/register', { method: 'POST', body: { account: 'ab', password: '1', role: 'tenant' } })
    expect(res.status).toBe(422)
    expect(res.data.code).toBe('VALIDATION_FAILED')
    expect(Array.isArray(res.data.details)).toBe(true)
  })
})

describe('认证', () => {
  it('登录成功返回双令牌与用户信息', async () => {
    const res = await api('/api/v1/auth/login', { method: 'POST', body: { ...TENANT, password: 'renthub123' } })
    expect(res.status).toBe(200)
    expect(res.data.access_token).toBeTruthy()
    expect(res.data.refresh_token).toBeTruthy()
    expect(res.data.user.role).toBe('tenant')
    expect(res.data.expires_in).toBeGreaterThan(0)
  })

  it('角色不符返回 AUTH_ROLE_MISMATCH', async () => {
    const res = await api('/api/v1/auth/login', { method: 'POST', body: { account: 'xiaofs', password: 'renthub123', role: 'merchant' } })
    expect(res.status).toBe(403)
    expect(res.data.code).toBe('AUTH_ROLE_MISMATCH')
  })

  it('连续 5 次密码错误后账号锁定', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await api('/api/v1/auth/login', { method: 'POST', body: { ...TENANT, password: 'wrongpass1' } })
      expect([401, 423]).toContain(r.status)
    }
    const locked = await api('/api/v1/auth/login', { method: 'POST', body: { ...TENANT, password: 'renthub123' } })
    expect(locked.status).toBe(423)
    expect(locked.data.code).toBe('AUTH_LOCKED')
  })

  it('refresh 一次性使用，重复使用被拒', async () => {
    const login1 = await api('/api/v1/auth/login', { method: 'POST', body: { ...TENANT, password: 'renthub123' } })
    const rt = login1.data.refresh_token as string
    const first = await api('/api/v1/auth/refresh', { method: 'POST', body: { refresh_token: rt } })
    expect(first.status).toBe(200)
    const second = await api('/api/v1/auth/refresh', { method: 'POST', body: { refresh_token: rt } })
    expect(second.status).toBe(401)
    expect(second.data.code).toBe('AUTH_REFRESH_REUSED')
  })
})

describe('房源', () => {
  it('列表只返回在架房源，并支持游标分页', async () => {
    const page1 = await api('/api/v1/listings?limit=3')
    expect(page1.status).toBe(200)
    expect(page1.data.items).toHaveLength(3)
    expect(page1.data.next_cursor).toBeTruthy()

    const page2 = await api(`/api/v1/listings?limit=3&cursor=${encodeURIComponent(page1.data.next_cursor)}`)
    expect(page2.data.items).toHaveLength(3)
    const ids1 = page1.data.items.map((i: any) => i.id)
    const ids2 = page2.data.items.map((i: any) => i.id)
    expect(ids1.some((id: number) => ids2.includes(id))).toBe(false)
  })

  it('区域与地铁互斥', async () => {
    const res = await api('/api/v1/listings?region=shahekou&metro_line=1')
    expect(res.status).toBe(422)
  })

  it('筛选与排序生效', async () => {
    const res = await api('/api/v1/listings?rent_min=300000&rent_max=500000&sort=price_asc')
    expect(res.status).toBe(200)
    const rents = res.data.items.map((i: any) => i.rent)
    expect(rents.every((r: number) => r >= 300000 && r <= 500000)).toBe(true)
    expect([...rents].sort((a: number, b: number) => a - b)).toEqual(rents)
  })

  it('详情包含价格、商家、规格与设施', async () => {
    const res = await api('/api/v1/listings/101')
    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({
      id: 101,
      region_name: '沙河口区',
      layout: '2室1厅',
      status: 'online',
    })
    expect(res.data.price.rent).toBeGreaterThan(0)
    expect(res.data.merchant).toHaveProperty('verified')
    expect(res.data.spec).toHaveProperty('min_lease_months')
    expect(Array.isArray(res.data.images)).toBe(true)
  })

  it('收藏开关同步到列表', async () => {
    const token = await login(TENANT.role, TENANT.account)
    const before = await api('/api/v1/favorites', { token })
    const beforeCount = before.data.items.length
    await api('/api/v1/favorites', { method: 'POST', token, body: { listing_id: 107, on: true } })
    const after = await api('/api/v1/favorites', { token })
    expect(after.data.items.length).toBe(beforeCount + 1)
    await api('/api/v1/favorites', { method: 'POST', token, body: { listing_id: 107, on: false } })
    const back = await api('/api/v1/favorites', { token })
    expect(back.data.items.length).toBe(beforeCount)
  })
})

describe('订单状态机', () => {
  it('下单计算金额、锁定房源，并拒绝重复下单', async () => {
    const token = await login(TENANT.role, TENANT.account)
    const detail = await api('/api/v1/listings/121').catch(() => null)
    void detail

    /* 101 已经被种子订单锁住，用 107 走一遍完整流程 */
    const created = await api('/api/v1/orders', {
      method: 'POST',
      token,
      body: { listing_id: 107, months: 12, check_in_date: '2026-12-01' },
    })
    expect(created.status).toBe(201)
    expect(created.data.total_amount).toBe(760000 * 12 + 760000 + Math.round(760000 * 0.05 * 12))
    expect(created.data.status).toBe('pending')

    const state = await api('/__mock__/state')
    const listing = state.data.listings.find((l: any) => l.id === 107)
    expect(listing.status).toBe('locked')

    const again = await api('/api/v1/orders', {
      method: 'POST',
      token,
      body: { listing_id: 107, months: 12, check_in_date: '2026-12-01' },
    })
    expect(again.status).toBe(409)
    expect(again.data.code).toBe('LISTING_LOCKED')
  })

  it('入住日期越界与租期越界被拒绝', async () => {
    const token = await login(TENANT.role, TENANT.account)
    const past = await api('/api/v1/orders', { method: 'POST', token, body: { listing_id: 107, months: 12, check_in_date: '2026-11-05' } })
    expect(past.status).toBe(422)
    const tooLong = await api('/api/v1/orders', { method: 'POST', token, body: { listing_id: 107, months: 36, check_in_date: '2026-12-01' } })
    expect(tooLong.status).toBe(422)
  })

  it('商家接单 → 完成，非法流转返回 409', async () => {
    const tenant = await login(TENANT.role, TENANT.account)
    const merchant = await login(MERCHANT.role, MERCHANT.account)
    const order = await api('/api/v1/orders', { method: 'POST', token: tenant, body: { listing_id: 107, months: 6, check_in_date: '2026-12-01' } })
    const id = order.data.id

    const completeTooEarly = await api(`/api/v1/orders/${id}/complete`, { method: 'POST', token: merchant })
    expect(completeTooEarly.status).toBe(409)
    expect(completeTooEarly.data.code).toBe('ORDER_STATE_INVALID')

    const confirmed = await api(`/api/v1/orders/${id}/confirm`, { method: 'POST', token: merchant })
    expect(confirmed.status).toBe(200)
    expect(confirmed.data.status).toBe('confirmed')

    const completed = await api(`/api/v1/orders/${id}/complete`, { method: 'POST', token: merchant })
    expect(completed.data.status).toBe('completed')
    expect(completed.data.logs.length).toBeGreaterThanOrEqual(3)

    const state = await api('/__mock__/state')
    expect(state.data.listings.find((l: any) => l.id === 107).status).toBe('rented')
  })

  it('拒单释放房源并通知租客', async () => {
    const tenant = await login(TENANT.role, TENANT.account)
    const merchant = await login(MERCHANT.role, MERCHANT.account)
    const order = await api('/api/v1/orders', { method: 'POST', token: tenant, body: { listing_id: 107, months: 6, check_in_date: '2026-12-01' } })
    const rejected = await api(`/api/v1/orders/${order.data.id}/reject`, { method: 'POST', token: merchant, body: { reason: '已被长租预定' } })
    expect(rejected.data.status).toBe('rejected')

    const state = await api('/__mock__/state')
    expect(state.data.listings.find((l: any) => l.id === 107).status).toBe('online')

    const notices = await api('/api/v1/notifications', { token: tenant })
    expect(notices.data.items.some((n: any) => n.title.includes('拒单'))).toBe(true)
  })

  it('越权：租客不能接单，商家不能取消别人的订单', async () => {
    const tenant = await login(TENANT.role, TENANT.account)
    const merchant = await login(MERCHANT.role, MERCHANT.account)
    const order = await api('/api/v1/orders', { method: 'POST', token: tenant, body: { listing_id: 107, months: 3, check_in_date: '2026-12-01' } })

    const tenantConfirm = await api(`/api/v1/orders/${order.data.id}/confirm`, { method: 'POST', token: tenant })
    expect(tenantConfirm.status).toBe(403)
    expect(tenantConfirm.data.code).toBe('ROLE_FORBIDDEN')

    const adminCancel = await api(`/api/v1/orders/${order.data.id}/cancel`, { method: 'POST', token: merchant })
    expect(adminCancel.status).toBe(403)
  })
})

describe('支付幂等', () => {
  it('缺少 Idempotency-Key 返回 400', async () => {
    const tenant = await login(TENANT.role, TENANT.account)
    const order = await api('/api/v1/orders', { method: 'POST', token: tenant, body: { listing_id: 107, months: 3, check_in_date: '2026-12-01' } })
    const pay = await api(`/api/v1/orders/${order.data.id}/pay`, { method: 'POST', token: tenant })
    expect(pay.status).toBe(400)
    expect(pay.data.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
  })

  it('同一个 key 重放返回同一笔流水，不重复扣款', async () => {
    const tenant = await login(TENANT.role, TENANT.account)
    const order = await api('/api/v1/orders', { method: 'POST', token: tenant, body: { listing_id: 107, months: 3, check_in_date: '2026-12-01' } })
    const key = 'test-key-1'
    const first = await api(`/api/v1/orders/${order.data.id}/pay`, { method: 'POST', token: tenant, headers: { 'Idempotency-Key': key } })
    expect(first.status).toBe(201)
    const second = await api(`/api/v1/orders/${order.data.id}/pay`, { method: 'POST', token: tenant, headers: { 'Idempotency-Key': key } })
    expect(second.data.trade_no).toBe(first.data.trade_no)

    const state = await api('/__mock__/state')
    const pays = state.data.payments.filter((p: any) => p.orderId === order.data.id)
    expect(pays).toHaveLength(1)
  })
})

describe('资质闸门与管理员', () => {
  it('未通过资质的商家上架房源被拒（QUALIFICATION_REQUIRED）', async () => {
    const res = await api('/api/v1/auth/login', { method: 'POST', body: { account: 'haibin', password: 'renthub123', role: 'merchant' } })
    const token = res.data.access_token as string
    const created = await api('/api/v1/listings', {
      method: 'POST',
      token,
      body: { title: '测试房源', region_code: 'shahekou', address: '测试地址', rooms: 1, area: 40, rent_type: 'whole', rent: 100000, deposit: 100000, available_date: '2026-12-01' },
    })
    expect(created.status).toBe(403)
    expect(created.data.code).toBe('QUALIFICATION_REQUIRED')
  })

  it('管理员审核资质，驳回原因不足 10 字被拒', async () => {
    const admin = await login(ADMIN.role, ADMIN.account)
    const list = await api('/api/v1/admin/qualifications?status=pending', { token: admin })
    expect(list.data.items.length).toBeGreaterThan(0)
    const id = list.data.items[0].id

    const tooShort = await api(`/api/v1/admin/qualifications/${id}/reject`, { method: 'POST', token: admin, body: { reason: '太模糊' } })
    expect(tooShort.status).toBe(422)

    const ok = await api(`/api/v1/admin/qualifications/${id}/reject`, { method: 'POST', token: admin, body: { reason: '营业执照照片不清晰，请重新上传彩色原件' } })
    expect(ok.status).toBe(200)
    expect(ok.data.status).toBe('rejected')
  })

  it('禁用用户会同步下架其在架房源', async () => {
    const admin = await login(ADMIN.role, ADMIN.account)
    const users = await api('/api/v1/admin/users', { token: admin })
    const merchant = users.data.items.find((u: any) => u.account === 'xingchen')
    const res = await api(`/api/v1/admin/users/${merchant.id}/disable`, { method: 'POST', token: admin, body: { reason: '多次发布虚假房源信息' } })
    expect(res.data.status).toBe('disabled')

    const state = await api('/__mock__/state')
    const online = state.data.listings.filter((l: any) => l.merchantId === merchant.id && l.status === 'online')
    expect(online).toHaveLength(0)
  })
})

describe('通知', () => {
  it('全部标为已读后未读数归零', async () => {
    const tenant = await login(TENANT.role, TENANT.account)
    const before = await api('/api/v1/notifications', { token: tenant })
    expect(before.data.unread).toBeGreaterThan(0)
    const res = await api('/api/v1/notifications/read-all', { method: 'POST', token: tenant })
    expect(res.status).toBe(204)
    const after = await api('/api/v1/notifications', { token: tenant })
    expect(after.data.unread).toBe(0)
  })
})

describe('AI（SSE）', () => {
  it('流式事件按 delta → conditions → cards → done 返回', async () => {
    const tenant = await login(TENANT.role, TENANT.account)
    const res = await fetch(`${base}/api/v1/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tenant}` },
      body: JSON.stringify({ scene: 'find_house', message: '沙河口 两室 3000 以内' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await res.text()
    const events = [...text.matchAll(/^event: (\w+)$/gm)].map((m) => m[1])
    expect(events[0]).toBe('delta')
    expect(events).toContain('conditions')
    expect(events).toContain('cards')
    expect(events[events.length - 1]).toBe('done')
  })

  it('参考价：口径从精确到宽泛降级，放宽时 relaxed=true', async () => {
    const tenant = await login(TENANT.role, TENANT.account)
    const res = await api('/api/v1/ai/price-reference', { method: 'POST', token: tenant, body: { listing_id: 101 } })
    expect(res.status).toBe(200)
    expect(res.data.sample_count).toBeGreaterThan(0)
    expect(['region+rooms+area', 'region+rooms', 'region', 'city']).toContain(res.data.scope)
    expect(typeof res.data.relaxed).toBe('boolean')
    expect(res.data).toHaveProperty('note')
  })

  it('参考价：样本不足时默认行为是「不给假区间」', async () => {
    const tenant = await login(TENANT.role, TENANT.account)
    process.env.MOCK_PRICE_MIN_SAMPLE = '1000'
    try {
      const res = await api('/api/v1/ai/price-reference', { method: 'POST', token: tenant, body: { listing_id: 101 } })
      expect(res.status).toBe(200)
      expect(res.data.insufficient).toBe(true)
      expect(res.data.range).toBeNull()
      expect(res.data.sample_count).toBeGreaterThan(0)
      expect(res.data.note).toContain('样本不足')
    } finally {
      delete process.env.MOCK_PRICE_MIN_SAMPLE
    }
  })

  it('参考价：补充样本后（bulk）返回正常分位数，并命中中位数缓存', async () => {
    const tenant = await login(TENANT.role, TENANT.account)
    const bulk = await api('/__mock__/listings/bulk', {
      method: 'POST',
      body: { count: 6, region_code: 'shahekou', rooms: 2, area: 86, rent: 300000 },
    })
    expect(bulk.data.count).toBe(6)

    const first = await api('/api/v1/ai/price-reference', { method: 'POST', token: tenant, body: { listing_id: 101 } })
    expect(first.data.insufficient).toBe(false)
    expect(first.data.scope).toBe('region+rooms+area')
    expect(first.data.range).toHaveProperty('median')
    expect(first.data.range.p25).toBeLessThanOrEqual(first.data.range.median)

    const second = await api('/api/v1/ai/price-reference', { method: 'POST', token: tenant, body: { listing_id: 101 } })
    expect(second.data.range.median).toBe(first.data.range.median)
  })
})

describe('测试钩子', () => {
  it('tick 推进时间后，超期未接单的订单被自动关闭并释放房源', async () => {
    const tenant = await login(TENANT.role, TENANT.account)
    const order = await api('/api/v1/orders', { method: 'POST', token: tenant, body: { listing_id: 107, months: 3, check_in_date: '2026-12-01' } })
    const tick = await api('/__mock__/tick?days=3', { method: 'POST' })
    expect(tick.data.autoClosedOrders).toBeGreaterThanOrEqual(1)

    const state = await api('/__mock__/state')
    expect(state.data.listings.find((l: any) => l.id === 107).status).toBe('online')
    const detail = await api(`/api/v1/orders/${order.data.id}`, { token: tenant })
    expect(detail.data.status).toBe('cancelled')
  })

  it('reset 恢复种子数据', async () => {
    await api('/api/v1/favorites', { method: 'POST', token: await login(TENANT.role, TENANT.account), body: { listing_id: 107, on: true } })
    await api('/__mock__/reset', { method: 'POST' })
    const before = await api('/__mock__/state')
    expect(before.data.orders).toHaveLength(2)
    expect(before.data.payments).toHaveLength(1)
  })
})
