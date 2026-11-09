/**
 * API 客户端：所有数据都来自后端（/api/*），前端不存任何业务数据副本
 */
export class ApiError extends Error {
  constructor(message, code, status, payload) {
    super(message);
    this.code = code || 'http';
    this.status = status || 0;
    this.payload = payload || null;
  }
}

function qs(params = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === '全部') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function req(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError('网络异常，请检查服务是否在运行', 'network', 0);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
  if (!res.ok) throw new ApiError(data?.error || `请求失败（${res.status}）`, data?.code, res.status, data);
  return data;
}

export const api = {
  /* 元数据 / 会话 */
  meta: () => req('/api/meta'),
  me: () => req('/api/auth/me'),
  login: (p) => req('/api/auth/login', { method: 'POST', body: p }),
  logout: () => req('/api/auth/logout', { method: 'POST' }),
  register: (p) => req('/api/auth/register', { method: 'POST', body: p }),

  /* 房源 */
  houses: (params) => req(`/api/houses${qs(params)}`),
  house: (id) => req(`/api/houses/${encodeURIComponent(id)}`),

  /* 收藏 */
  favorites: () => req('/api/favorites'),
  setFavorite: (houseId, on) => req('/api/favorites', { method: 'POST', body: { houseId, on } }),

  /* 订单 */
  orders: (tab) => req(`/api/orders${qs({ tab })}`),
  createOrder: (p) => req('/api/orders', { method: 'POST', body: p }),
  cancelOrder: (no) => req(`/api/orders/${encodeURIComponent(no)}/cancel`, { method: 'POST', body: {} }),

  /* 消息 */
  messages: (tab) => req(`/api/messages${qs({ tab })}`),
  readAllMessages: () => req('/api/messages/read-all', { method: 'POST', body: {} }),

  /* 草稿（填写的内容不丢） */
  getDraft: (key) => req(`/api/drafts/${encodeURIComponent(key)}`).then((r) => r.data ?? null).catch(() => null),
  saveDraft: (key, data) => req(`/api/drafts/${encodeURIComponent(key)}`, { method: 'PUT', body: { data } }),
  clearDraft: (key) => req(`/api/drafts/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => null),

  /* 个人信息 */
  profile: () => req('/api/profile'),
  saveProfile: (p) => req('/api/profile', { method: 'PUT', body: p }),

  /* 商家端 */
  merchantHouses: (params) => req(`/api/merchant/houses${qs(params)}`),
  merchantHouse: (id) => req(`/api/merchant/houses/${encodeURIComponent(id)}`),
  createHouse: (p) => req('/api/merchant/houses', { method: 'POST', body: p }),
  saveHouse: (id, p) => req(`/api/merchant/houses/${encodeURIComponent(id)}`, { method: 'PUT', body: p }),
  toggleHouseStatus: (id) => req(`/api/merchant/houses/${encodeURIComponent(id)}/status`, { method: 'POST', body: {} }),
  merchantOrders: (tab) => req(`/api/merchant/orders${qs({ tab })}`),
  merchantOrderAction: (no, action, extra) => req(`/api/merchant/orders/${encodeURIComponent(no)}/${action}`, { method: 'POST', body: extra || {} }),
  merchantProfile: () => req('/api/merchant/profile'),
  saveMerchantProfile: (p) => req('/api/merchant/profile', { method: 'PUT', body: p }),

  /* 管理员端 */
  adminReviews: (params) => req(`/api/admin/reviews${qs(params)}`),
  adminReview: (id, action, extra) => req(`/api/admin/reviews/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: extra || {} }),

  /* AI 找房 */
  agent: () => req('/api/agent'),

  /* 兼容层自检 */
  adapters: () => req('/api/adapters'),
};
