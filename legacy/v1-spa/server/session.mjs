/**
 * Session（httpOnly cookie）—— 登录态真正的判定方在服务端
 *
 * 为什么：如果登录态只存 localStorage，用户手改一个字段就能进商家端/管理员端。
 * 前端路由守卫只是「体验层」，真正的门禁在这里：任何 /api 保护接口都校验
 * session + 角色，非法链接即便绕过前端守卫也拿不到数据。
 */
import { randomUUID } from 'node:crypto';
import { db, touch } from './store.mjs';

const COOKIE = 'rh_sid';
const MAX_AGE_SEC = 7 * 24 * 3600;          // 与登录页「7 天内记住我」对齐
const SLIDING_MS = 30 * 60 * 1000;          // 30 分钟滑动续期

export function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function createSession(userId) {
  const d = db();
  const sid = randomUUID().replace(/-/g, '');
  d.sessions[sid] = { userId, createdAt: Date.now(), lastSeen: Date.now() };
  touch();
  return sid;
}

/** 读取当前会话；无效返回 null */
export function readSession(req) {
  const sid = parseCookies(req)[COOKIE];
  if (!sid) return null;
  const d = db();
  const s = d.sessions[sid];
  if (!s) return null;
  if (Date.now() - s.createdAt > MAX_AGE_SEC * 1000) {
    delete d.sessions[sid];
    touch();
    return null;
  }
  if (Date.now() - s.lastSeen > SLIDING_MS) { s.lastSeen = Date.now(); touch(); }
  return { sid, ...s };
}

export function destroySession(req) {
  const sid = parseCookies(req)[COOKIE];
  const d = db();
  if (sid && d.sessions[sid]) { delete d.sessions[sid]; touch(); }
  return sid;
}

export function sessionCookie(sid) {
  return `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}`;
}
export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/* ---------------- 登录失败锁定（真实生效，非演示文案） ---------------- */
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

export function attemptState(account) {
  const rec = db().loginAttempts[account];
  if (!rec) return { fails: 0, locked: false };
  if (rec.lockUntil && rec.lockUntil > Date.now()) {
    return { fails: rec.fails, locked: true, unlockAt: new Date(rec.lockUntil).toTimeString().slice(0, 5) };
  }
  return { fails: rec.fails || 0, locked: false };
}

export function noteFailure(account) {
  const d = db();
  const rec = d.loginAttempts[account] || { fails: 0 };
  rec.fails = (rec.fails || 0) + 1;
  if (rec.fails >= MAX_FAILS) { rec.lockUntil = Date.now() + LOCK_MS; rec.fails = 0; }
  d.loginAttempts[account] = rec;
  touch();
  return attemptState(account);
}

export function clearFailures(account) {
  const d = db();
  if (d.loginAttempts[account]) { delete d.loginAttempts[account]; touch(); }
}
