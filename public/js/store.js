/**
 * 前端状态（只放「会话 + 提示」这类临时状态）
 *
 * 业务数据（房源、收藏、订单、消息、草稿）一律走 /api，刷新或换设备都还在；
 * 这里只缓存会话信息与计数，避免每个组件重复请求。
 */
import { reactive, computed } from './lib.js';
import { api, ApiError } from './api.js';

export { ApiError };

export const state = reactive({
  booted: false,
  me: null,
  counts: { favorites: 0, orders: 0, messages: 0 },
  merchantCounts: { pending: 0, confirmed: 0, done: 0, rejected: 0, total: 0 },
  meta: null,
  toast: null,
  /* 顶栏红点用到的额外计数（由商家端/管理员端页面回填） */
  merchantHouses: null,
  adminPending: null,
});

export const isLoggedIn = computed(() => Boolean(state.me));
export const role = computed(() => state.me?.role || 'guest');

/** 各角色的默认落地页 */
export const HOME_BY_ROLE = {
  tenant: '/',
  merchant: '/merchant/listings',
  admin: '/admin/review',
  guest: '/login',
};

let bootPromise = null;

/** 首次进入应用：并行拿「元数据」和「当前会话」 */
export async function bootstrap() {
  if (state.booted) return state;
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    const meta = await api.meta().catch(() => null);
    if (meta) {
      state.meta = meta;
      state.me = meta.me;
      state.counts = meta.counts || state.counts;
    }
    state.booted = true;
    return state;
  })();
  return bootPromise;
}

export async function refreshSession() {
  try {
    const r = await api.me();
    state.me = r.me;
    state.counts = r.counts || state.counts;
  } catch {
    state.me = null;
  }
  return state.me;
}

export function setSession(me, counts) {
  state.me = me;
  if (counts) state.counts = counts;
}

export async function login({ role: r, account, password }) {
  const res = await api.login({ role: r, account, password });
  setSession(res.me, res.counts);
  return res;
}

export async function register(payload) {
  const res = await api.register(payload);
  setSession(res.me, res.counts);
  return res;
}

export async function logout() {
  await api.logout().catch(() => null);
  state.me = null;
  state.counts = { favorites: 0, orders: 0, messages: 0 };
  state.merchantCounts = { pending: 0, confirmed: 0, done: 0, rejected: 0, total: 0 };
}

export function setCounts(c) { if (c) state.counts = { ...state.counts, ...c }; }
export function setMerchantCounts(c) { if (c) state.merchantCounts = c; }

/* ---------------- 全局提示 ---------------- */
let toastTimer = null;
export function toast(message, kind = 'info', ms = 2600) {
  state.toast = { message, kind, at: Date.now() };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = null; }, ms);
}

/* ---------------- 滚动位置（刷新/后退都保持） ---------------- */
const SKEY = 'rh:scroll:';
export function savePos(path, y) {
  try { sessionStorage.setItem(SKEY + path, String(Math.round(y))); } catch { /* 隐私模式 */ }
}
export function readPos(path) {
  try {
    const v = sessionStorage.getItem(SKEY + path);
    return v === null ? -1 : Number(v) || 0;
  } catch { return -1; }
}

/* ---------------- 表单草稿自动保存（内容不丢） ---------------- */
export function useDraft(key) {
  let timer = null;
  let last = '';
  return {
    /** 读取草稿（登录态下才有；未登录返回 null） */
    async load() {
      if (!key) return null;
      return api.getDraft(key);
    },
    /** 防抖保存 */
    save(data) {
      if (!key || !state.me) return;
      const json = JSON.stringify(data);
      if (json === last) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        last = json;
        api.saveDraft(key, data).catch(() => { /* 草稿失败不打扰用户 */ });
      }, 450);
    },
    async clear() {
      clearTimeout(timer);
      last = '';
      if (key) await api.clearDraft(key);
    },
  };
}

/* ---------------- 渠道角色名 ---------------- */
export const ROLE_LABEL = { tenant: '租客', merchant: '商家', admin: '管理员', guest: '访客' };
