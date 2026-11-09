/**
 * /api 路由（零依赖）
 *
 * 分层约定：
 *   前端 → api.mjs（鉴权 + 业务）→ catalog.mjs（统一房源模型）→ store.mjs（持久化）
 * 所有写操作都落盘到 runtime/store.json，因此刷新/重启后状态不丢。
 */
import {
  db, touch, publicUser, userByAccount, userById, counts, hashPassword, verifyPassword,
  merchantCounts, merchantOrders, setHouseIndex,
} from './store.mjs';
import {
  createSession, readSession, destroySession, sessionCookie, clearCookie,
  attemptState, noteFailure, clearFailures,
} from './session.mjs';
import * as catalog from './data/catalog.mjs';
import { FACILITY_BEDROOM, FACILITY_PUBLIC, DISTRICTS, RENT_TYPES, HOUSE_TYPES, ORIENTS, DECORS } from './data/schema.mjs';

/* ============================ 工具 ============================ */
export function sendJson(res, data, status = 200, extra = {}) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(body);
}

function httpError(status, message, code) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  return e;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 512 * 1024) throw httpError(413, '请求体过大');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError(400, '请求体不是合法 JSON'); }
}

/** 取当前用户（含角色校验） */
function requireUser(req, roles) {
  const s = readSession(req);
  const u = s && userById(s.userId);
  if (!u) throw httpError(401, '请先登录', 'unauth');
  if (roles && !roles.includes(u.role)) throw httpError(403, '当前账号无权访问该接口', 'forbidden');
  return u;
}

const ORDER_STATE = {
  pending: { label: '待商家确认', kind: 'warn' },
  confirmed: { label: '已确认', kind: '' },
  done: { label: '已完成', kind: 'plain' },
  cancelled: { label: '已取消', kind: 'plain' },
  rejected: { label: '已拒绝', kind: 'plain' },
};

function orderView(o) {
  const st = ORDER_STATE[o.state] || ORDER_STATE.pending;
  return { ...o, stateLabel: st.label, stateKind: st.kind };
}

function money(n) { return Number(n || 0).toLocaleString('en-US'); }

/* ============================ 主入口 ============================ */
export async function handleApi(req, res, url) {
  await catalog.ensure();
  const p = url.pathname.replace(/\/+$/, '') || '/api';
  const q = url.searchParams;
  const method = req.method.toUpperCase();

  /* ---------------- 元数据 ---------------- */
  if (p === '/api/meta' && method === 'GET') {
    const s = readSession(req);
    const user = s && userById(s.userId);
    return sendJson(res, {
      provider: catalog.state.source,
      providerTitle: catalog.state.description,
      loadedAt: catalog.state.loadedAt,
      summary: catalog.summary(),
      filters: {
        districts: mergeDistrictOptions(),
        metros: ['1 号线', '2 号线', '3 号线', '5 号线', '12 号线'],
        rentTypes: RENT_TYPES,
        houseTypes: HOUSE_TYPES,
        orients: ORIENTS,
        decors: DECORS,
        facilities: { bedroom: FACILITY_BEDROOM, public: FACILITY_PUBLIC },
      },
      me: publicUser(user),
      counts: user ? counts(user.id) : { favorites: 0, orders: 0, messages: 0 },
    });
  }

  /* ---------------- 认证 ---------------- */
  if (p === '/api/auth/me' && method === 'GET') {
    const s = readSession(req);
    const user = s && userById(s.userId);
    return sendJson(res, {
      me: publicUser(user),
      counts: user ? counts(user.id) : { favorites: 0, orders: 0, messages: 0 },
    });
  }

  if (p === '/api/auth/login' && method === 'POST') {
    const { role = 'tenant', account = '', password = '' } = await readBody(req);
    const acc = String(account).trim();

    if (!acc || !password) return sendJson(res, { error: '请输入账号和密码', code: 'badpwd' }, 400);

    const lock = attemptState(acc);
    if (lock.locked) {
      return sendJson(res, {
        error: `连续 5 次密码错误，账号已锁定 15 分钟。${lock.unlockAt} 之后可重试，或联系管理员解锁。`,
        code: 'locked',
      }, 423);
    }

    const user = userByAccount(acc);
    if (!user || !verifyPassword(password, user.salt, user.hash)) {
      const st = noteFailure(acc);
      const left = Math.max(0, 5 - st.fails);
      return sendJson(res, {
        error: st.locked
          ? '连续 5 次密码错误，账号已锁定 15 分钟。'
          : `账号或密码不正确。你还可以再试 ${left} 次，超过 5 次该账号会被锁定 15 分钟。`,
        code: st.locked ? 'locked' : 'badpwd',
      }, 401);
    }

    if (user.role !== role) {
      const roleName = { tenant: '租客', merchant: '商家', admin: '管理员' }[user.role] || user.role;
      return sendJson(res, {
        error: `该账号是${roleName}账号，请从上方「${roleName}」入口登录。`,
        code: 'wrongrole',
        actualRole: user.role,
      }, 403);
    }

    clearFailures(acc);
    const sid = createSession(user.id);
    return sendJson(res, {
      me: publicUser(user),
      counts: counts(user.id),
      redirect: user.role === 'merchant' ? '/merchant/listings' : user.role === 'admin' ? '/admin/review' : '/',
    }, 200, { 'Set-Cookie': sessionCookie(sid) });
  }

  if (p === '/api/auth/logout' && method === 'POST') {
    destroySession(req);
    return sendJson(res, { ok: true }, 200, { 'Set-Cookie': clearCookie() });
  }

  if (p === '/api/auth/register' && method === 'POST') {
    const { role = 'tenant', account = '', password = '', confirm = '' } = await readBody(req);
    const acc = String(account).trim();
    if (role !== 'tenant' && role !== 'merchant') throw httpError(400, '注册身份只能是租客或商家');
    if (!/^[A-Za-z0-9]{4,20}$/.test(acc)) throw httpError(400, '账号需 4~20 位字母或数字');
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,20}$/.test(String(password))) throw httpError(400, '密码需 8~20 位，且同时包含字母与数字');
    if (password !== confirm) throw httpError(400, '两次输入的密码不一致');
    if (userByAccount(acc)) throw httpError(409, '该账号已被注册');

    const d = db();
    const id = `u-${role}-${Date.now().toString(36)}`;
    const nickname = role === 'merchant' ? `${acc}的小店` : `租客${acc.slice(-4)}`;
    const { salt, hash } = hashPassword(String(password));
    const user = {
      id, role, account: acc, nickname, initial: nickname.slice(0, 1), salt, hash,
      phone: '', createdAt: new Date().toISOString().slice(0, 10),
      ...(role === 'merchant' ? { merchantId: id } : {}),
    };
    d.users.push(user);
    d.favorites[id] = [];
    if (role === 'merchant') {
      d.merchantProfiles[id] = {
        merchantId: id, shopName: nickname, tel: '', intro: '', verifyState: 'pending',
        docs: [], history: [{ time: new Date().toISOString().slice(0, 16).replace('T', ' '), action: '提交资质', docs: '0 张', result: '待审核', kind: 'plain' }],
        submittedAt: new Date().toISOString().slice(0, 10), reviewedAt: '',
      };
    }
    touch();
    const sid = createSession(id);
    return sendJson(res, {
      me: publicUser(user),
      counts: { favorites: 0, orders: 0, messages: 0 },
      redirect: role === 'merchant' ? '/merchant/profile' : '/',
    }, 200, { 'Set-Cookie': sessionCookie(sid) });
  }

  /* ---------------- 房源 ---------------- */
  if (p === '/api/houses' && method === 'GET') {
    const result = catalog.query({
      page: q.get('page'), size: q.get('size'),
      district: q.get('district'), metro: q.get('metro'),
      rentMin: q.get('rentMin'), rentMax: q.get('rentMax'),
      rooms: q.get('rooms'), rentType: q.get('rentType'),
      type: q.get('type'), orient: q.get('orient'),
      elevator: q.get('elevator'), q: q.get('q'), sort: q.get('sort'), tag: q.get('tag'),
    });
    const s = readSession(req);
    const favs = s ? (db().favorites[s.userId] || []) : [];
    return sendJson(res, {
      ...result,
      items: result.items.map((h) => houseCard(h, favs.includes(h.id))),
      summary: catalog.summary(),
    });
  }

  let m = p.match(/^\/api\/houses\/([\w-]+)$/);
  if (m && method === 'GET') {
    const h = catalog.get(m[1]);
    if (!h) throw httpError(404, '未找到该房源');
    const s = readSession(req);
    const favs = s ? (db().favorites[s.userId] || []) : [];
    return sendJson(res, {
      house: houseDetail(h),
      related: catalog.related(h.id, 3).map((x) => houseCard(x, favs.includes(x.id))),
      favorited: favs.includes(h.id),
      facilitiesDict: { bedroom: FACILITY_BEDROOM, public: FACILITY_PUBLIC },
      counts: s ? counts(s.userId) : { favorites: 0, orders: 0, messages: 0 },
    });
  }

  /* ---------------- 收藏 ---------------- */
  if (p === '/api/favorites' && method === 'GET') {
    const u = requireUser(req);
    const d = db();
    const ids = d.favorites[u.id] || [];
    const items = ids.map((id) => catalog.get(id)).filter(Boolean).map((h) => houseCard(h, true));
    return sendJson(res, {
      items,
      total: items.length,
      summary: {
        lowest: items.length ? Math.min(...items.map((x) => x.rent)) : 0,
        highest: items.length ? Math.max(...items.map((x) => x.rent)) : 0,
      },
    });
  }

  if (p === '/api/favorites' && (method === 'POST' || method === 'PUT')) {
    const u = requireUser(req);
    const { houseId, on } = await readBody(req);
    const h = catalog.get(String(houseId));
    if (!h) throw httpError(404, '未找到该房源');
    const d = db();
    const list = d.favorites[u.id] || (d.favorites[u.id] = []);
    const idx = list.indexOf(h.id);
    const want = on === undefined ? idx < 0 : Boolean(on);
    if (want && idx < 0) list.unshift(h.id);
    if (!want && idx >= 0) list.splice(idx, 1);
    touch();
    return sendJson(res, { ok: true, favorited: want, counts: counts(u.id) });
  }

  /* ---------------- 订单 ---------------- */
  if (p === '/api/orders' && method === 'GET') {
    const u = requireUser(req);
    const d = db();
    const mine = d.orders
      .filter((o) => o.userId === u.id)
      .map(orderView)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const tab = q.get('tab') || 'all';
    const filtered = tab === 'all' ? mine : mine.filter((o) => o.state === tab);
    return sendJson(res, {
      items: filtered,
      tabs: [
        { key: 'all', label: '全部', n: mine.length },
        { key: 'pending', label: '待确认', n: mine.filter((o) => o.state === 'pending').length },
        { key: 'confirmed', label: '已确认', n: mine.filter((o) => o.state === 'confirmed').length },
        { key: 'done', label: '已完成', n: mine.filter((o) => o.state === 'done').length },
        { key: 'cancelled', label: '已取消', n: mine.filter((o) => o.state === 'cancelled').length },
      ],
      counts: counts(u.id),
    });
  }

  if (p === '/api/orders' && method === 'POST') {
    const u = requireUser(req, ['tenant']);
    const body = await readBody(req);
    const h = catalog.get(String(body.houseId));
    if (!h) throw httpError(404, '未找到该房源');
    if (h.listing.status !== '在架') throw httpError(409, `该房源当前状态为「${h.listing.status}」，无法下单`);

    const months = Math.min(36, Math.max(1, Number(body.months) || 12));
    const rent = h.pricing.rent;
    const deposit = h.pricing.deposit;
    const serviceFee = h.pricing.serviceFee;
    const total = rent * months + deposit + serviceFee;

    const d = db();
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const seq = String(d.orders.filter((o) => String(o.no).includes(stamp)).length + 1).padStart(3, '0');
    const order = {
      no: `RH${stamp}${seq}`,
      userId: u.id,
      houseId: h.id,
      months,
      checkIn: String(body.checkIn || h.availability.availableFrom || ''),
      guests: Math.min(8, Math.max(1, Number(body.guests) || 1)),
      phone: String(body.phone || u.phone || ''),
      note: String(body.note || '').slice(0, 500),
      state: 'pending',
      createdAt: now.toISOString().slice(0, 16).replace('T', ' '),
      rent, deposit, serviceFee, total,
      house: { title: h.title, meta: h.meta, img: h.cover },
      tenant: { name: u.nickname, phone: String(body.phone || u.phone || '') },
      merchantId: h.merchant.id,
    };
    d.orders.push(order);
    d.messages.push({
      id: `n-${Date.now().toString(36)}`,
      userId: u.id, kind: 'order',
      title: '订单待商家确认',
      body: `订单 ${order.no} 已提交，商家将在 24 小时内确认。`,
      time: '刚刚', unread: true,
    });
    /* 下单后清掉草稿，避免下次进来看到上一单的内容 */
    delete d.drafts[`${u.id}:booking:${h.id}`];
    touch();
    return sendJson(res, { ok: true, order: orderView(order), total, counts: counts(u.id) });
  }

  m = p.match(/^\/api\/orders\/([\w-]+)\/cancel$/);
  if (m && method === 'POST') {
    const u = requireUser(req);
    const d = db();
    const o = d.orders.find((x) => x.no === m[1] && x.userId === u.id);
    if (!o) throw httpError(404, '未找到该订单');
    if (o.state !== 'pending') throw httpError(409, '只有「待商家确认」的订单可以取消');
    o.state = 'cancelled';
    d.messages.push({
      id: `n-${Date.now().toString(36)}`, userId: u.id, kind: 'order',
      title: '订单已取消', body: `订单 ${o.no} 已取消，款项将原路退回（演示）。`, time: '刚刚', unread: true,
    });
    touch();
    return sendJson(res, { ok: true, order: orderView(o), counts: counts(u.id) });
  }

  /* ---------------- 消息 ---------------- */
  if (p === '/api/messages' && method === 'GET') {
    const u = requireUser(req);
    const d = db();
    const tab = q.get('tab') || 'all';
    const all = d.messages.filter((x) => x.userId === u.id);
    const items = (tab === 'all' ? all : all.filter((x) => x.kind === tab));
    return sendJson(res, {
      items,
      unread: all.filter((x) => x.unread).length,
      tabs: [
        { key: 'all', label: '全部', n: all.length },
        { key: 'order', label: '订单', n: all.filter((x) => x.kind === 'order').length },
        { key: 'house', label: '房源', n: all.filter((x) => x.kind === 'house').length },
        { key: 'system', label: '系统', n: all.filter((x) => x.kind === 'system').length },
      ],
      counts: counts(u.id),
    });
  }

  if (p === '/api/messages/read-all' && method === 'POST') {
    const u = requireUser(req);
    const d = db();
    d.messages.forEach((x) => { if (x.userId === u.id) x.unread = false; });
    touch();
    return sendJson(res, { ok: true, counts: counts(u.id) });
  }

  /* ---------------- 草稿（表单内容不丢） ---------------- */
  if (p.startsWith('/api/drafts/')) {
    const key = decodeURIComponent(p.slice('/api/drafts/'.length));
    if (method === 'GET') {
      const s = readSession(req);
      if (!s) return sendJson(res, { data: null });
      const rec = db().drafts[`${s.userId}:${key}`] || null;
      return sendJson(res, rec ? { data: rec.data, updatedAt: rec.updatedAt } : { data: null });
    }
    if (method === 'PUT' || method === 'POST') {
      const u = requireUser(req);
      const { data } = await readBody(req);
      const d = db();
      d.drafts[`${u.id}:${key}`] = { data, updatedAt: new Date().toISOString() };
      touch();
      return sendJson(res, { ok: true });
    }
    if (method === 'DELETE') {
      const s = readSession(req);
      if (s) { delete db().drafts[`${s.userId}:${key}`]; touch(); }
      return sendJson(res, { ok: true });
    }
  }

  /* ---------------- 个人信息 ---------------- */
  if (p === '/api/profile' && method === 'GET') {
    const u = requireUser(req);
    return sendJson(res, {
      me: publicUser(u),
      completeness: completeness(u),
    });
  }
  if (p === '/api/profile' && method === 'PUT') {
    const u = requireUser(req);
    const body = await readBody(req);
    const nickname = String(body.nickname || '').trim();
    if (nickname.length < 1 || nickname.length > 20) throw httpError(400, '昵称需 1~20 个字符');
    u.nickname = nickname;
    u.initial = nickname.slice(0, 1);
    if (body.newPassword) {
      if (!verifyPassword(body.oldPassword || '', u.salt, u.hash)) throw httpError(400, '当前密码不正确');
      if (!/^(?=.*[A-Za-z])(?=.*\d).{8,20}$/.test(String(body.newPassword))) throw httpError(400, '新密码需 8~20 位，且同时包含字母与数字');
      const { salt, hash } = hashPassword(String(body.newPassword));
      u.salt = salt; u.hash = hash;
    }
    touch();
    return sendJson(res, { ok: true, me: publicUser(u), completeness: completeness(u) });
  }
  function completeness(u) {
    const items = [
      { label: '昵称', done: Boolean(u.nickname), text: u.nickname ? '已填写' : '未填写' },
      { label: '头像', done: false, text: '未上传' },
      { label: '实名信息', done: false, text: '未填写' },
    ];
    const pct = Math.round((items.filter((x) => x.done).length / items.length) * 100);
    return { items, pct };
  }

  /* ---------------- 商家端 ---------------- */
  if (p === '/api/merchant/houses' && method === 'GET') {
    const u = requireUser(req, ['merchant']);
    const merchantId = u.merchantId || 'm-001';
    const list = catalog.byMerchant(merchantId);
    const kw = String(q.get('q') || '').trim();
    const status = String(q.get('status') || '全部状态');
    const items = list
      .filter((h) => (status === '全部状态' ? true : h.listing.status === status))
      .filter((h) => (!kw ? true : (h.title + h.meta).includes(kw)))
      .map((h) => ({
        id: h.id, img: h.cover, title: h.title, meta: h.meta,
        state: h.listing.status,
        stateKind: h.listing.status === '在架' ? '' : h.listing.status === '已出租' ? 'hue' : 'plain',
        rent: money(h.pricing.rent), rentRaw: h.pricing.rent,
        views: h.listing.views, fav: h.listing.favCount, time: h.listing.updatedLabel,
        action: h.listing.status === '在架' ? '下架' : h.listing.status === '已下架' ? '上架' : '查看订单',
      }));
    const inList = list.filter((h) => h.listing.status === '在架').length;
    const rented = list.filter((h) => h.listing.status === '已出租').length;
    const off = list.filter((h) => h.listing.status === '已下架').length;
    return sendJson(res, {
      items,
      note: `${list.length} 套 · 在架 ${inList} · 已出租 ${rented} · 已下架 ${off}`,
      canCreate: u.merchantId === 'm-001',
    });
  }

  m = p.match(/^\/api\/merchant\/houses\/([\w-]+)$/);
  if (m && method === 'GET') {
    const u = requireUser(req, ['merchant']);
    /* 新建入口：返回一份空白模板，前端表单结构与编辑页完全一致 */
    if (m[1] === 'new') {
      return sendJson(res, { house: blankHouse(`h-${Date.now().toString(36)}`, u), valuation: null, isNew: true });
    }
    const h = catalog.get(m[1]);
    if (!h) throw httpError(404, '未找到该房源');
    return sendJson(res, { house: h, valuation: valuationFor(h) });
  }

  if (p === '/api/merchant/houses' && method === 'POST') {
    const u = requireUser(req, ['merchant']);
    const body = await readBody(req);
    const id = `h-${Date.now().toString(36)}`;
    const h = blankHouse(id, u);
    applyHouseEdit(h, body);
    h.listing.status = '在架';
    h.listing.updatedLabel = '刚刚';
    catalog.insert(h);
    const d = db();
    d.newHouses = d.newHouses || {};
    d.newHouses[id] = { ...h };
    touch();
    return sendJson(res, { ok: true, house: h });
  }
  if (m && (method === 'PUT' || method === 'POST')) {
    const u = requireUser(req, ['merchant']);
    const h = catalog.get(m[1]);
    if (!h) throw httpError(404, '未找到该房源');
    if (h.listing.status === '已出租') throw httpError(409, '房源处于「已出租」时不能修改');
    const body = await readBody(req);
    applyHouseEdit(h, body);
    rememberEdit(h);
    touch();
    return sendJson(res, { ok: true, house: h });
  }

  m = p.match(/^\/api\/merchant\/houses\/([\w-]+)\/status$/);
  if (m && method === 'POST') {
    requireUser(req, ['merchant']);
    const h = catalog.get(m[1]);
    if (!h) throw httpError(404, '未找到该房源');
    const next = h.listing.status === '在架' ? '已下架' : h.listing.status === '已下架' ? '在架' : null;
    if (!next) throw httpError(409, '「已出租」状态不能手动切换');
    h.listing.status = next;
    rememberEdit(h);
    touch();
    return sendJson(res, { ok: true, status: next });
  }

  if (p === '/api/merchant/orders' && method === 'GET') {
    const u = requireUser(req, ['merchant']);
    const merchantId = u.merchantId || 'm-001';
    const all = merchantOrders(merchantId);
    const tab = q.get('tab') || 'all';
    const filtered = tab === 'all' ? all : all.filter((o) => o.state === tab);
    return sendJson(res, {
      items: filtered.map((o) => ({ ...orderView(o), houseTitle: o.house.title })),
      tabs: [
        { key: 'all', label: '全部', n: all.length },
        { key: 'pending', label: '待确认', n: all.filter((o) => o.state === 'pending').length },
        { key: 'confirmed', label: '已确认', n: all.filter((o) => o.state === 'confirmed').length },
        { key: 'done', label: '已完成', n: all.filter((o) => o.state === 'done').length },
        { key: 'rejected', label: '已拒绝', n: all.filter((o) => o.state === 'rejected').length },
      ],
      counts: merchantCounts(merchantId),
    });
  }

  m = p.match(/^\/api\/merchant\/orders\/([\w-]+)\/(accept|reject|finish)$/);
  if (m && method === 'POST') {
    const u = requireUser(req, ['merchant']);
    const d = db();
    const o = d.orders.find((x) => x.no === m[1]);
    if (!o) throw httpError(404, '未找到该订单');
    if (m[2] === 'accept') {
      if (o.state !== 'pending') throw httpError(409, '只有待确认的订单可以接单');
      o.state = 'confirmed';
      const h = catalog.get(o.houseId);
      if (h) { h.listing.status = '已出租'; rememberEdit(h); }
      d.messages.push({ id: `n-${Date.now().toString(36)}`, userId: o.userId, kind: 'order', title: '商家已接单', body: `商家已确认你的订单 ${o.no}，房源已为你锁定。`, time: '刚刚', unread: true });
    } else if (m[2] === 'reject') {
      if (o.state !== 'pending') throw httpError(409, '只有待确认的订单可以拒单');
      const body = await readBody(req);
      o.state = 'rejected';
      o.rejectReason = String(body.reason || '').slice(0, 200);
      d.messages.push({ id: `n-${Date.now().toString(36)}`, userId: o.userId, kind: 'order', title: '订单被拒绝', body: `订单 ${o.no} 被商家拒绝${o.rejectReason ? `：${o.rejectReason}` : ''}，款项将原路退回（演示）。`, time: '刚刚', unread: true });
    } else {
      if (o.state !== 'confirmed') throw httpError(409, '只有已确认的订单可以标记完成');
      o.state = 'done';
    }
    touch();
    return sendJson(res, { ok: true, order: orderView(o), counts: merchantCounts(u.merchantId || 'm-001') });
  }

  if (p === '/api/merchant/profile' && method === 'GET') {
    const u = requireUser(req, ['merchant']);
    const merchantId = u.merchantId || 'm-001';
    const d = db();
    const profile = d.merchantProfiles[merchantId] || d.merchantProfiles['m-001'];
    const list = catalog.byMerchant(merchantId);
    const stateKind = profile.verifyState === 'approved' ? 'ok' : profile.verifyState === 'pending' ? 'plain' : 'warn';
    const stateText = profile.verifyState === 'approved' ? '已通过' : profile.verifyState === 'pending' ? '待审核' : '已驳回';
    return sendJson(res, {
      profile,
      stateText, stateKind,
      canList: list.filter((h) => h.listing.status === '在架').length,
    });
  }
  if (p === '/api/merchant/profile' && method === 'PUT') {
    const u = requireUser(req, ['merchant']);
    const merchantId = u.merchantId || 'm-001';
    const body = await readBody(req);
    const d = db();
    const profile = d.merchantProfiles[merchantId] || (d.merchantProfiles[merchantId] = {
      merchantId, docs: [], history: [], verifyState: 'pending', submittedAt: '', reviewedAt: '',
    });
    if (body.shopName !== undefined) profile.shopName = String(body.shopName).slice(0, 30);
    if (body.tel !== undefined) profile.tel = String(body.tel).slice(0, 30);
    if (body.intro !== undefined) profile.intro = String(body.intro).slice(0, 300);
    touch();
    return sendJson(res, { ok: true, profile });
  }

  /* ---------------- 管理员端 ---------------- */
  if (p === '/api/admin/reviews' && method === 'GET') {
    requireUser(req, ['admin']);
    const d = db();
    const state = q.get('state') || 'all';
    const items = d.reviews.filter((r) => (state === 'all' ? true : r.state === state));
    return sendJson(res, {
      items,
      activeId: q.get('id') || items[0]?.id || null,
      tabs: [
        { key: 'all', label: '全部', n: d.reviews.length },
        { key: 'pending', label: '待审核', n: d.reviews.filter((r) => r.state === 'pending').length },
        { key: 'approved', label: '已通过', n: d.reviews.filter((r) => r.state === 'approved').length },
        { key: 'rejected', label: '已驳回', n: d.reviews.filter((r) => r.state === 'rejected').length },
      ],
    });
  }

  m = p.match(/^\/api\/admin\/reviews\/([\w-]+)\/(approve|reject)$/);
  if (m && method === 'POST') {
    requireUser(req, ['admin']);
    const d = db();
    const rv = d.reviews.find((x) => x.id === m[1]);
    if (!rv) throw httpError(404, '未找到该审核单');
    if (rv.state !== 'pending') throw httpError(409, '该申请已处理');
    if (m[2] === 'approve') {
      rv.state = 'approved';
      rv.reason = '';
      const p2 = d.merchantProfiles[rv.merchantId];
      if (p2) { p2.verifyState = 'approved'; p2.reviewedAt = new Date().toISOString().slice(0, 10); }
    } else {
      const body = await readBody(req);
      const reason = String(body.reason || '').trim();
      if (reason.length < 10) throw httpError(400, '驳回原因不少于 10 字，说明需要补正的材料');
      rv.state = 'rejected';
      rv.reason = reason;
      const p2 = d.merchantProfiles[rv.merchantId];
      if (p2) { p2.verifyState = 'rejected'; p2.reviewedAt = new Date().toISOString().slice(0, 10); }
    }
    touch();
    return sendJson(res, { ok: true, review: rv });
  }

  /* ---------------- AI 找房（对话与候选都来自后端） ---------------- */
  if (p === '/api/agent' && method === 'GET') {
    const s = readSession(req);
    const favs = s ? (db().favorites[s.userId] || []) : [];
    const filtered = catalog.query({ district: '沙河口', rooms: '2', rentMax: 3000, elevator: '1', size: 12 });
    const shk = catalog.query({ district: '沙河口', size: 12 });
    const picked = (filtered.items.length ? filtered.items : shk.items).slice(0, 4);
    const candidates = picked.map((h) => houseCard(h, favs.includes(h.id)));

    const first = catalog.get('h-001');
    const second = picked.find((h) => h.id !== first?.id) || picked[0];
    const walk = (h) => (h?.place?.metro?.walkM || 0);
    const diffLine = first && second && second.id !== first.id
      ? `第二套「${second.title}」登记的地铁线路是 ${second.place.metro.line}，地址在 ${second.place.area}，步行约 ${walk(second)} 米；第一套「${first.place.area}」是 ${walk(first)} 米。` +
        `它比第一套${walk(second) > walk(first) ? '远' : '近'} ${Math.abs(walk(second) - walk(first))} 米，租金${second.pricing.rent < first.pricing.rent ? '低' : '高'} ${money(Math.abs(second.pricing.rent - first.pricing.rent))} 元/月，面积${second.spec.area < first.spec.area ? '小' : '大'} ${Math.abs(Math.round(second.spec.area - first.spec.area))} ㎡。`
      : '';

    return sendJson(res, {
      thread: [
        { role: 'user', avatar: '肖', text: '沙河口 两室 3000 以内 有电梯' },
        {
          role: 'agent',
          text: '我识别到三个条件：<b>租金 ≤ 3000</b>、<b>二室</b>、<b>有电梯</b>。还有一个不确定：「沙河口」可以指行政区，也可以指附近的片区，你要哪一个？',
          options: [
            { text: `沙河口区 · ${catalog.query({ district: '沙河口' }).total} 套` },
            { text: `星海广场 · ${catalog.query({ district: '沙河口', q: '星海广场' }).total} 套` },
            { text: `西安路 · ${catalog.query({ district: '沙河口', q: '西安路' }).total} 套` },
            { text: '跳过', skip: true },
          ],
        },
        { role: 'user', avatar: '肖', text: '沙河口区' },
        {
          role: 'agent',
          text: `按「沙河口区 · 二室 · ≤3000 · 有电梯」共找到 ${filtered.total} 套，按综合排序先看这 ${Math.min(3, candidates.length)} 套：`,
          minis: candidates.slice(0, 3).map((c) => ({
            id: c.id, img: c.cover, title: c.title.replace(' · ', ' '), rent: c.rent, rentText: c.rentText,
          })),
          options: [{ text: '只要近地铁' }, { text: '面积 80 平以上' }, { text: '就这些', skip: true }],
        },
        { role: 'user', avatar: '肖', text: '第二套离地铁远吗' },
        { role: 'agent', text: diffLine, hint: '这两条信息来自房源登记的字段与地址，未填写的字段不会被推测。' },
      ],
      sideTitle: '本次候选',
      sideCount: `${candidates.length} 套`,
      candidates: candidates.map((c) => ({
        id: c.id, cover: c.cover, title: c.title,
        meta: `${Math.abs(Math.round(c.area))}㎡ · ${c.orient} · ${c.metro || (c.elevator ? '有电梯' : '')}`.replace(/ · $/, ''),
        rent: c.rent, rentText: c.rentText,
      })),
      hint: 'Enter 发送 · Shift + Enter 换行 · 回答基于房源结构化字段与平台统计',
    });
  }

  /* ---------------- 兼容层自检（不含任何 Key 明文） ---------------- */
  if (p === '/api/adapters' && method === 'GET') {
    return sendJson(res, {
      active: catalog.state.source,
      available: [
        { provider: 'v2-demo', title: 'v2 演示房源（9 条）', url: '?' },
        { provider: 'places', title: '大连住宅 POI（175 条）', desc: '启动时设 CATALOG_SOURCE=places 切换' },
      ],
      geometry: Object.fromEntries(
        Object.entries(Object.fromEntries(catalog.state.geoRefs)).slice(0, 3),
      ),
      geoResolved: [...catalog.state.geoRefs.values()].reduce((acc, v) => {
        acc[v.how] = (acc[v.how] || 0) + 1; return acc;
      }, {}),
      loadedAt: catalog.state.loadedAt,
    });
  }

  return false;
}

/* ============================ 视图/映射 ============================ */

function mergeDistrictOptions() {
  const set = new Set(catalog.summary().districts);
  return ['全部', ...DISTRICTS.filter((d) => true), ...[...set].filter((d) => !DISTRICTS.includes(d))];
}

/** 卡片视图：只给瀑布流需要的字段（保持 v2 卡片结构不变） */
function houseCard(h, favorited) {
  const tags = h.tags.filter((t) => t.kind === 'blue').slice(0, 2);
  return {
    id: h.id,
    href: `/house/${h.id}`,
    cover: h.cover,
    ar: h.images[0]?.ar || '4/3',
    title: h.title,
    meta: h.meta,
    tags: tags.length ? tags : h.tags.slice(0, 2),
    when: h.listing.updatedLabel,
    rent: h.pricing.rent,
    rentText: money(h.pricing.rent),
    rentType: h.spec.rentType,
    district: h.place.district,
    rooms: h.spec.rooms,
    area: h.spec.area,
    orient: h.spec.orient,
    decor: h.spec.decor,
    elevator: h.spec.elevator,
    metro: h.place.metro.line ? `${h.place.metro.line} · ${h.place.metro.walkM} m 到地铁` : '',
    coord: h.coord,
    favorited,
  };
}

/** 详情视图 */
function houseDetail(h) {
  return {
    id: h.id,
    title: h.title,
    meta: h.meta,
    images: h.images,
    galleryCount: h.images.length,
    description: h.description,
    tags: h.tags,
    coord: h.coord,
    place: h.place,
    spec: {
      ...h.spec,
      roomsText: `${h.spec.rooms} 室 ${h.spec.halls} 厅 ${h.spec.baths} 卫`,
      floorText: `${h.spec.floor} / ${h.spec.totalFloor} 层`,
      areaText: `${Math.round(h.spec.area)} ㎡`,
    },
    pricing: { ...h.pricing, rentText: money(h.pricing.rent), depositText: money(h.pricing.deposit), serviceFeeText: money(h.pricing.serviceFee) },
    availability: h.availability,
    facilities: h.facilities,
    merchant: h.merchant,
    listing: h.listing,
    breadcrumb: [h.place.district, h.place.area].filter(Boolean),
  };
}

/** 商家编辑：把表单字段写回统一模型 */
function applyHouseEdit(h, b) {
  const numOf = (v) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; };
  if (b.title) h.title = String(b.title).slice(0, 60);
  if (b.desc !== undefined) h.description.text = String(b.desc).slice(0, 1000);
  if (b.type) h.spec.type = b.type;
  if (b.rentType) h.spec.rentType = b.rentType;
  if (b.district) h.place.district = b.district;
  if (b.community !== undefined) h.place.area = String(b.community).slice(0, 40);
  if (b.address !== undefined) h.place.address = String(b.address).slice(0, 120);
  if (b.metro) h.place.metro.line = b.metro;
  if (b.walk !== undefined) h.place.metro.walkM = numOf(b.walk);
  if (b.room) {
    const m = String(b.room).match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);
    if (m) { h.spec.rooms = +m[1]; h.spec.halls = +m[2]; h.spec.baths = +m[3]; }
    else {
      const m2 = String(b.room).match(/(\d+)\s*室\s*(\d+)\s*厅(?:\s*(\d+)\s*卫)?/);
      if (m2) { h.spec.rooms = +m2[1]; h.spec.halls = +m2[2]; h.spec.baths = +(m2[3] || 0); }
    }
  }
  if (b.area !== undefined) h.spec.area = numOf(b.area);
  if (b.floor) {
    const m = String(b.floor).match(/(\d+)\s*\/\s*(\d+)/);
    if (m) { h.spec.floor = +m[1]; h.spec.totalFloor = +m[2]; }
  }
  if (b.orient) h.spec.orient = b.orient;
  if (b.decor) h.spec.decor = b.decor;
  if (b.elevator !== undefined) h.spec.elevator = Boolean(b.elevator);
  if (b.bedroom !== undefined) h.facilities.bedroom = pickFacilities(b.bedroom, FACILITY_BEDROOM);
  if (b.publicFac !== undefined) h.facilities.public = pickFacilities(b.publicFac, FACILITY_PUBLIC);
  if (b.rent !== undefined) {
    h.pricing.rent = numOf(b.rent);
    h.pricing.deposit = b.deposit !== undefined ? numOf(b.deposit) : h.pricing.rent;
    h.pricing.serviceFee = Math.round(h.pricing.rent * 0.05);
  }
  if (b.deposit !== undefined && b.rent === undefined) h.pricing.deposit = numOf(b.deposit);
  if (b.avail) h.availability.availableFrom = b.avail;
  if (b.minMonths) h.availability.minMonths = numOf(b.minMonths);
  if (b.pay) h.pricing.payMethod = b.pay;
  if (b.view) h.availability.viewing = b.view;
  if (b.park !== undefined) h.availability.parking = String(b.park).slice(0, 80);
  h.meta = [
    h.place.district, `${Math.round(h.spec.area)}㎡`, h.spec.orient,
    h.spec.totalFloor ? `${h.spec.floor}/${h.spec.totalFloor}层` : '', h.spec.decor,
  ].filter(Boolean).join(' · ');
  h.listing.updatedLabel = '刚刚';
}

function pickFacilities(checked, dict) {
  const set = new Set(Array.isArray(checked) ? checked : []);
  return dict.filter((x) => set.has(x.label)).map((x) => ({ ...x }));
}

/** 商家新建房源用的空白统一模型（字段齐全，前端表单直接可填） */
function blankHouse(id, user) {
  const merchantId = user.merchantId || 'm-001';
  const anchor = catalog.state.anchors.get('沙河口') || { lon: 121.5938, lat: 38.8955 };
  return {
    id,
    code: 'RH',
    title: '未命名房源',
    meta: '',
    images: [{ src: '/assets/modern-living-room-with-stylish-furniture-and.jpg', alt: '房源室内实拍，教学演示图片', ar: '4/3' }],
    cover: '/assets/modern-living-room-with-stylish-furniture-and.jpg',
    description: { text: '', kv: [] },
    tags: [{ text: '新上房源', kind: 'hue' }],
    coord: { lon: anchor.lon, lat: anchor.lat, sys: 'GCJ02' },
    place: { city: '大连', district: '沙河口', area: '', address: '', metro: { line: '1 号线', walkM: 0 } },
    spec: { rooms: 1, halls: 1, baths: 1, area: 50, floor: 1, totalFloor: 6, orient: '朝南', decor: '简装', type: '普通住宅', rentType: '整租', elevator: false },
    pricing: { rent: 2000, deposit: 2000, serviceFee: 100, payMethod: '押一付三' },
    availability: { availableFrom: '', minMonths: 6, viewing: '随时可看', parking: '' },
    facilities: { bedroom: [], public: [] },
    merchant: {
      id: merchantId, name: user.nickname, initial: user.nickname.slice(0, 1),
      listings: 0, verified: true, responseText: '资质已认证 · 平均响应 1 小时',
    },
    listing: { status: '已下架', updatedLabel: '刚刚', views: 0, favCount: 0 },
    source: { provider: 'merchant', ref: id },
  };
}

/** 启动时把商家新建的房源重新插回目录 */
export function replayNewHouses() {
  const created = db().newHouses || {};
  let n = 0;
  for (const [id, h] of Object.entries(created)) {
    if (catalog.get(id)) continue;
    catalog.insert(h);
    n++;
  }
  if (n) console.log(`[store] 恢复 ${n} 条商家新建房源`);
}

/** AI 辅助定价：同区域、同户型房源的租金区间（全部来自 catalog，不猜） */
function valuationFor(h) {
  const peers = catalog.all()
    .filter((x) => x.id !== h.id && x.place.district === h.place.district)
    .sort((a, b) => Math.abs(a.spec.area - h.spec.area) - Math.abs(b.spec.area - h.spec.area))
    .slice(0, 3);
  const sample = catalog.all().filter((x) => x.place.district === h.place.district && x.spec.rooms === h.spec.rooms);
  const rents = (sample.length ? sample : peers).map((x) => x.pricing.rent).sort((a, b) => a - b);
  const min = rents.length ? rents[0] : h.pricing.rent;
  const max = rents.length ? rents[rents.length - 1] : h.pricing.rent;
  const median = rents.length ? rents[Math.floor(rents.length / 2)] : h.pricing.rent;
  const lo = Math.max(300, Math.round((min * 0.96) / 10) * 10);
  const hi = Math.round((max * 1.04) / 10) * 10;
  const inRange = h.pricing.rent >= lo && h.pricing.rent <= hi;
  return {
    scope: `${h.place.district} × ${h.spec.rooms}室 × ${Math.round(h.spec.area * 0.7)}–${Math.round(h.spec.area * 1.2)}㎡`,
    range: `${money(lo)} – ${money(hi)} 元`,
    samples: rents.length,
    median: money(median),
    rent: money(h.pricing.rent),
    inRange,
    peers: peers.map((x) => ({
      label: `${x.place.area} · ${Math.round(x.spec.area)}㎡ · ${x.spec.decor}`,
      price: money(x.pricing.rent),
    })),
    why: `同区域同户型在架的 ${rents.length} 套里，租金集中在 ${money(lo)}–${money(hi)} 元；` +
      `你这套${h.spec.elevator ? '带电梯' : '无电梯'}且距地铁 ${h.place.metro.walkM} 米，定价${inRange ? '处于区间内' : '在区间之外'}。`,
    candidates: [
      `${h.place.area}${h.spec.decor}${h.spec.rooms}居 ${h.tags.find((t) => t.text === '近地铁') ? '近地铁' : ''}${h.spec.elevator ? '带电梯' : ''}`.trim(),
      `${h.place.district} ${Math.round(h.spec.area)}㎡ ${h.spec.orient}通透 拎包入住`,
    ],
  };
}

/** 把商家改过的字段记到 store，重启后重放 */function rememberEdit(h) {
  const d = db();
  d.houseEdits = d.houseEdits || {};
  d.houseEdits[h.id] = {
    title: h.title, meta: h.meta, status: h.listing.status, updatedLabel: h.listing.updatedLabel,
    desc: h.description.text, district: h.place.district, area: h.place.area, address: h.place.address,
    metro: h.place.metro, spec: h.spec, pricing: h.pricing, availability: h.availability, facilities: h.facilities,
  };
}

/** 启动时把 store 里的编辑重放到 catalog（内存）上 */
export function replayEdits() {
  const edits = db().houseEdits || {};
  let n = 0;
  for (const [id, e] of Object.entries(edits)) {
    const h = catalog.get(id);
    if (!h) continue;
    applyHouseEdit(h, {
      title: e.title, desc: e.desc, district: e.district, community: e.area, address: e.address,
      metro: e.metro?.line, walk: e.metro?.walkM,
      room: `${e.spec.rooms}/${e.spec.halls}/${e.spec.baths}`,
      area: e.spec.area, floor: `${e.spec.floor}/${e.spec.totalFloor}`,
      orient: e.spec.orient, decor: e.spec.decor, elevator: e.spec.elevator,
      bedroom: e.facilities?.bedroom?.map((x) => x.label),
      publicFac: e.facilities?.public?.map((x) => x.label),
      rent: e.pricing.rent, deposit: e.pricing.deposit,
      avail: e.availability.availableFrom, minMonths: e.availability.minMonths,
      pay: e.pricing.payMethod, view: e.availability.viewing, park: e.availability.parking,
    });
    h.listing.status = e.status;
    h.listing.updatedLabel = e.updatedLabel;
    n++;
  }
  if (n) console.log(`[store] 重放 ${n} 条商家编辑到房源目录`);
}

export function buildHouseIndex() {
  const idx = {};
  for (const h of catalog.all()) idx[h.id] = h.merchant.id;
  setHouseIndex(idx);
}
