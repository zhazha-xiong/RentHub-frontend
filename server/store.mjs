/**
 * 运行时状态存储：runtime/store.json（零依赖、原子写、防抖落盘）
 *
 * 为什么不用内存：用户要求「刷新不丢失状态」——收藏、订单、表单草稿、登录态
 * 都写到这里；服务重启后依然在。
 */
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.STORE_FILE
  ? path.resolve(process.env.STORE_FILE)
  : path.resolve(HERE, '..', 'runtime', 'store.json');

/* ---------------- 密码 ---------------- */
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(String(password), salt, 32).toString('hex');
  return { salt, hash };
}
export function verifyPassword(password, salt, hash) {
  try {
    const cur = scryptSync(String(password), salt, 32);
    const want = Buffer.from(hash, 'hex');
    return cur.length === want.length && timingSafeEqual(cur, want);
  } catch { return false; }
}

/* ---------------- 种子数据 ---------------- */
function seed() {
  const mk = (id, role, account, nickname, extra = {}) => {
    const { salt, hash } = hashPassword('renthub123');
    return { id, role, account, nickname, initial: nickname.slice(0, 1), salt, hash, ...extra };
  };
  const users = [
    mk('u-tenant-1', 'tenant', 'xiaofs', '肖福晟', { phone: '138 **** 6621', createdAt: '2026-09-12' }),
    mk('u-merchant-1', 'merchant', 'xingchen', '星辰公寓', { phone: '0411-8888 6621', merchantId: 'm-001', createdAt: '2026-03-02' }),
    mk('u-admin-1', 'admin', 'guanli', '管理员', { createdAt: '2026-01-01' }),
  ];

  const T = 'u-tenant-1';
  const day = (d) => d;

  const favorites = {
    [T]: ['h-001', 'h-002', 'h-003', 'h-004', 'h-005', 'h-006'],
  };

  const orders = [
    {
      no: 'RH20261104001', userId: T, houseId: 'h-001', months: 12, checkIn: '2026-12-01',
      guests: 2, phone: '138 **** 6621', note: '', state: 'pending', createdAt: '2026-11-04 10:22',
      rent: 3200, deposit: 3200, serviceFee: 160, total: 41760,
      house: { title: '星海广场 · 2室1厅', meta: '沙河口 · 86㎡ · 南北', img: '/assets/modern-living-room-with-stylish-furniture-and.jpg' },
      tenant: { name: '王俊锡', phone: '138 **** 6621' },
    },
    {
      no: 'RH20261028007', userId: T, houseId: 'h-003', months: 6, checkIn: '2026-11-20',
      guests: 1, phone: '138 **** 6621', note: '', state: 'confirmed', createdAt: '2026-10-28 19:40',
      rent: 4100, deposit: 4100, serviceFee: 205, total: 28905,
      house: { title: '软件园 · 2室2厅', meta: '高新园区 · 98㎡ · 东南', img: '/assets/living-room-in-apartment-of-condominio-do.jpg' },
      tenant: { name: '王俊锡', phone: '138 **** 6621' },
    },
    {
      no: 'RH20260715003', userId: T, houseId: 'h-006', months: 12, checkIn: '2026-08-01',
      guests: 2, phone: '138 **** 6621', note: '', state: 'done', createdAt: '2026-07-15 09:12',
      rent: 2650, deposit: 2650, serviceFee: 133, total: 34583,
      house: { title: '西安路 · 2室1厅', meta: '沙河口 · 78㎡ · 朝南', img: '/assets/kitchen-interior-of-apartment-in-brisbane-2025.jpg' },
      tenant: { name: '王俊锡', phone: '138 **** 6621' },
    },
    {
      no: 'RH20260620011', userId: T, houseId: 'h-002', months: 3, checkIn: '2026-07-01',
      guests: 1, phone: '138 **** 6621', note: '', state: 'cancelled', createdAt: '2026-06-20 15:03',
      rent: 1850, deposit: 1850, serviceFee: 93, total: 6205,
      house: { title: '和平广场 · 1室1厅', meta: '沙河口 · 52㎡ · 朝南', img: '/assets/bedroom-interior-of-apartment-in-brisbane-2025.jpg' },
      tenant: { name: '王俊锡', phone: '138 **** 6621' },
    },
    {
      no: 'RH20261104002', userId: 'u-tenant-9', houseId: 'h-006', months: 6, checkIn: '2026-11-15',
      guests: 2, phone: '139 **** 2180', note: '希望周末看房', state: 'pending', createdAt: '2026-11-04 09:05',
      rent: 2650, deposit: 2650, serviceFee: 133, total: 16695,
      house: { title: '西安路 · 2室1厅', meta: '沙河口 · 78㎡ · 朝南', img: '/assets/kitchen-interior-of-apartment-in-brisbane-2025.jpg' },
      tenant: { name: '李梦', phone: '139 **** 2180' },
    },
  ];

  const messages = [
    { id: 'n-1', userId: T, kind: 'order', title: '商家已接单', body: '星辰公寓已确认你的订单 RH20261104001，房源已为你锁定。', time: '10 分钟前', unread: true },
    { id: 'n-2', userId: T, kind: 'house', title: '你收藏的房源已下架', body: '「青泥洼桥 · 单间」已被商家下架，你可以看看相似房源。', time: '今天 09:12', unread: true },
    { id: 'n-3', userId: T, kind: 'order', title: '订单待商家确认', body: '订单 RH20261104001 已提交，商家将在 24 小时内确认。', time: '今天 08:40', unread: true },
    { id: 'n-4', userId: T, kind: 'house', title: '房源降价提醒', body: '「西安路 · 2室1厅」租金由 2,800 元调整为 2,650 元。', time: '昨天 18:02', unread: false },
    { id: 'n-5', userId: T, kind: 'system', title: '退款已到账', body: '订单 RH20260620011 的退款 6,205 元已原路退回（模拟）。', time: '2026-06-21', unread: false },
  ];

  const reviews = [
    {
      id: 'rv-1', merchantId: 'm-001', name: '星辰公寓', district: '沙河口', listings: 12,
      submittedAt: '今天 09:40', docs: 2, state: 'pending',
      shots: ['/assets/apartment-building-in-china.jpg', '/assets/new-orleans-french-quarter-apartment-living-room.jpg'],
      detail: '营业执照 · 法人身份证 · 提交于 2026-11-04 09:40',
      reason: '',
    },
    {
      id: 'rv-2', merchantId: 'm-002', name: '海滨小屋', district: '中山', listings: 3,
      submittedAt: '昨天 16:12', docs: 3, state: 'pending',
      shots: ['/assets/apartment-building-in-china.jpg', '/assets/bedroom-interior-of-apartment-in-brisbane-2025-2.jpg'],
      detail: '营业执照 · 法人身份证 · 经营场所证明 · 提交于 2026-11-03 16:12',
      reason: '',
    },
    {
      id: 'rv-3', merchantId: 'm-003', name: '高新区合租', district: '高新园区', listings: 6,
      submittedAt: '10-30 11:20', docs: 1, state: 'approved',
      shots: ['/assets/apartment-building-in-china.jpg'],
      detail: '营业执照 · 提交于 2026-10-30 11:20',
      reason: '',
    },
  ];

  return {
    version: 1,
    users,
    sessions: {},
    favorites,
    orders,
    messages,
    drafts: {},
    reviews,
    loginAttempts: {},
    merchantProfiles: {
      'm-001': {
        merchantId: 'm-001',
        shopName: '星辰公寓',
        tel: '0411-8888 6621',
        intro: '沙河口与高新园区整租为主，房源均为自持或独家代理，支持随时看房。',
        verifyState: 'approved',
        docs: ['/assets/apartment-building-in-china.jpg', '/assets/new-orleans-french-quarter-apartment-living-room.jpg'],
        history: [
          { time: '2026-10-28 14:02', action: '管理员审核', docs: '2 张', result: '通过', kind: 'ok' },
          { time: '2026-10-26 09:40', action: '提交资质', docs: '2 张', result: '待审核', kind: 'plain' },
          { time: '2026-09-30 11:15', action: '首次驳回', docs: '1 张', result: '缺法人身份证', kind: 'warn' },
        ],
        submittedAt: '2026-10-26',
        reviewedAt: '2026-10-28',
      },
    },
  };
}

/* ---------------- 读写 ---------------- */
let data = null;
let dirty = false;
let timer = null;

export async function init() {
  if (data) return data;
  await mkdir(path.dirname(FILE), { recursive: true });
  if (existsSync(FILE)) {
    try {
      data = JSON.parse(await readFile(FILE, 'utf8'));
      /* 兼容老文件：缺字段就补上，不丢已有数据 */
      const base = seed();
      for (const k of Object.keys(base)) if (data[k] === undefined) data[k] = base[k];
    } catch {
      console.warn('[store] store.json 解析失败，使用种子数据（原文件保留为 .bak）');
      try { await rename(FILE, FILE + '.bak'); } catch { /* ignore */ }
      data = seed();
    }
  } else {
    data = seed();
    await flush();
    console.log('[store] 已生成初始数据 → runtime/store.json');
  }
  return data;
}

export function db() {
  if (!data) throw new Error('store 未初始化：请先 await init()');
  return data;
}

export function touch() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => { timer = null; flush().catch((e) => console.error('[store] 写入失败', e.message)); }, 250);
}

export async function flush() {
  if (!data) return;
  const tmp = FILE + '.tmp';
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmp, FILE);
  dirty = false;
}

/* ---------------- 便捷查询 ---------------- */
export function userByAccount(account) {
  return db().users.find((u) => u.account === account) || null;
}
export function userById(id) {
  return db().users.find((u) => u.id === id) || null;
}
export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, role: u.role, account: u.account, nickname: u.nickname,
    initial: u.initial || u.nickname.slice(0, 1), phone: u.phone || '',
    createdAt: u.createdAt || '', merchantId: u.merchantId || null,
  };
}

/* ---------------- 计数（顶栏红点） ---------------- */
export function counts(userId) {
  const d = db();
  const fav = (d.favorites[userId] || []).length;
  const pending = d.orders.filter((o) => o.userId === userId && o.state === 'pending').length;
  const unread = d.messages.filter((m) => m.userId === userId && m.unread).length;
  return { favorites: fav, orders: pending, messages: unread };
}

export function merchantCounts(merchantId) {
  const d = db();
  const idx = d.housesIndex || {};
  const mine = d.orders.filter((o) => (idx[o.houseId] || o.merchantId) === merchantId);
  return {
    pending: mine.filter((o) => o.state === 'pending').length,
    confirmed: mine.filter((o) => o.state === 'confirmed').length,
    done: mine.filter((o) => o.state === 'done').length,
    rejected: mine.filter((o) => o.state === 'rejected').length,
    total: mine.length,
  };
}

export function merchantOrders(merchantId) {
  const d = db();
  const idx = d.housesIndex || {};
  return d.orders
    .filter((o) => (idx[o.houseId] || o.merchantId) === merchantId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** 房源 → 商家 的索引，启动时由 catalog 注入，订单归属据此判定 */
export function setHouseIndex(index) {
  db().housesIndex = index;
  touch();
}
