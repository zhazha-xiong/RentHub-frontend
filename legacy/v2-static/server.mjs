#!/usr/bin/env node
/**
 * 大连房源瀑布流 Demo —— 临时后端（零依赖，仅 Node 内置模块）
 *
 * 只使用【高德】服务，且 Key 全部由你在配置文件中自行填写：
 *   - 后端 Key（Web 服务类型）→ config.server.json 的 amapWebKey
 *   - 前端 Key（JS API 类型 + 安全密钥）→ public/config.js
 *
 * 职责：
 *   1. 静态文件托管
 *   2. /api/feed 分页数据（无限加载）
 *   3. /api/map/image  高德静态图代理（Key 不外泄）
 *   4. /api/map/regeo  高德逆地理编码代理
 *   5. 三级缓存：内存 + 磁盘 + 并发去重；限流 + 上游节流
 *   6. 坐标纠偏：数据源为 WGS-84，统一转成高德使用的 GCJ-02 再下发
 *
 * 启动：node server.mjs
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUB_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const CACHE_DIR = path.join(__dirname, 'cache');

/* ============ 静态根：public 是页面，assets / vendor 在工程根（与 public 平级） ============
 * 页面里的图片引用是 ../assets/xxx.jpg（相对 public 下的 html 解析），
 * 所以 /assets/* 与 /vendor/* 必须由这里显式映射到工程根，不能只服务 public/。
 * 目录穿越（..）一律拒绝。
 */
const EXTRA_ROOTS = {
  '/assets/': path.join(__dirname, 'assets'),
  '/vendor/': path.join(__dirname, 'vendor'),
};
function resolveExtraRoot(pathname) {
  for (const [prefix, base] of Object.entries(EXTRA_ROOTS)) {
    if (!pathname.startsWith(prefix)) continue;
    const abs = path.join(base, pathname.slice(prefix.length));
    if (!abs.startsWith(base)) return null;
    return existsSync(abs) ? abs : null;
  }
  return null;
}

const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || '127.0.0.1';

/* ============ 配置：高德 Web 服务 Key ============ */
let FILE_CFG = {};
try { FILE_CFG = JSON.parse(await readFile(path.join(__dirname, 'config.server.json'), 'utf8')); } catch { /* 没有配置文件 */ }
const AMAP_KEY = (process.env.AMAP_WEB_KEY || FILE_CFG.amapWebKey || '').trim();
const AMAP_HOST = 'https://restapi.amap.com';
/* 卡片缩略图默认关闭：瀑布流一屏 6~12 张图会把 Web 服务 QPS 打满（CUQPS_HAS_EXCEEDED_THE_LIMIT）。
   需要时用环境变量 ENABLE_CARD_THUMB=1 打开。 */
const ENABLE_CARD_THUMB = process.env.ENABLE_CARD_THUMB === '1';

/* 地图限定在“大连市内” */
const BBOX = { minLon: 121.0, maxLon: 122.6, minLat: 38.6, maxLat: 40.0 };

/* ============ 坐标纠偏：WGS-84 → GCJ-02 ============ */
const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;
const outOfChina = (lon, lat) => lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
function transformLat(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  r += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3;
  r += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3;
  return r;
}
function transformLon(x, y) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  r += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3;
  r += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3;
  return r;
}
function wgs84ToGcj02(lon, lat) {
  if (outOfChina(lon, lat)) return [lon, lat];
  let dLat = transformLat(lon - 105, lat - 35);
  let dLon = transformLon(lon - 105, lat - 35);
  const radLat = (lat / 180) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLon = (dLon * 180) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return [Number((lon + dLon).toFixed(6)), Number((lat + dLat).toFixed(6))];
}

/* ============ 缓存与统计 ============ */
const memCache = new Map();
const inflight = new Map();
const MEM_LIMIT = 400;
const stats = { hitMem: 0, hitDisk: 0, miss: 0, upstream: 0, dedup: 0, rateLimited: 0, startedAt: Date.now() };

/* ============ 限流 ============ */
const rateMap = new Map();
const RATE_LIMIT = 300;
const RATE_WINDOW = 60_000;
function rateLimited(ip) {
  const now = Date.now();
  let rec = rateMap.get(ip);
  if (!rec || now > rec.reset) { rec = { count: 0, reset: now + RATE_WINDOW }; rateMap.set(ip, rec); }
  if (++rec.count > RATE_LIMIT) { stats.rateLimited++; return true; }
  return false;
}

/* ============ 上游节流 ============ */
let nextSlot = 0;
const MIN_GAP = Number(process.env.UPSTREAM_GAP_MS || 500);   // 高德个人版 Web 服务约 3 QPS，默认 500ms（2 QPS）留余量
async function throttle() {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_GAP;
  const wait = slot - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

/* ============ 缓存读写 ============ */
function memTrim() {
  if (memCache.size <= MEM_LIMIT) return;
  let over = memCache.size - MEM_LIMIT;
  for (const k of memCache.keys()) { if (over-- <= 0) break; memCache.delete(k); }
}
async function cached(key, ttl, producer) {
  const hash = createHash('sha1').update(key).digest('hex');
  const file = path.join(CACHE_DIR, hash + '.bin');

  const mem = memCache.get(hash);
  if (mem && mem.expire > Date.now()) { stats.hitMem++; return { buf: mem.value, cache: 'mem' }; }

  try {
    const buf = await readFile(file);
    memCache.set(hash, { expire: Date.now() + ttl, value: buf });
    memTrim();
    stats.hitDisk++;
    return { buf, cache: 'disk' };
  } catch { /* 未命中 */ }

  if (inflight.has(hash)) { stats.dedup++; return inflight.get(hash); }

  const p = (async () => {
    try {
      stats.miss++;
      const buf = await producer();
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, buf).catch(() => {});
      memCache.set(hash, { expire: Date.now() + ttl, value: buf });
      memTrim();
      return { buf, cache: 'miss' };
    } finally { inflight.delete(hash); }
  })();
  inflight.set(hash, p);
  return p;
}

/* ============ 高德上游调用 ============ */
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function assertInDalian(lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw httpError(400, '经纬度参数错误');
  if (lon < BBOX.minLon || lon > BBOX.maxLon || lat < BBOX.minLat || lat > BBOX.maxLat) {
    throw httpError(400, `坐标超出大连市范围（允许 lon ${BBOX.minLon}~${BBOX.maxLon}, lat ${BBOX.minLat}~${BBOX.maxLat}）`);
  }
}
function requireKey() {
  if (!AMAP_KEY) throw httpError(503, '后端未配置高德 Web 服务 Key：请填写 config.server.json 的 amapWebKey 后重启服务');
}

/** 高德静态地图（服务端取图，前端只拿到 PNG） */
async function amapStaticImage({ lon, lat, w, h, zoom }) {
  requireKey();
  const q = new URLSearchParams({
    location: `${lon},${lat}`,
    zoom: String(zoom),
    size: `${w}*${h}`,
    scale: '1',
    markers: `mid,0x0F766E,A:${lon},${lat}`,
    key: AMAP_KEY,
  });
  const res = await fetch(`${AMAP_HOST}/v3/staticmap?${q}`, { headers: { 'User-Agent': 'dalian-demo/1.0' } });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || !ct.includes('image')) {
    const txt = await res.text().catch(() => '');
    throw httpError(502, `高德静态图失败（${res.status}）：${txt.slice(0, 160)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) throw httpError(502, '高德静态图内容异常');
  return buf;
}

/** 高德逆地理编码 */
async function amapRegeo(lon, lat) {
  requireKey();
  const q = new URLSearchParams({ location: `${lon},${lat}`, extensions: 'base', key: AMAP_KEY });
  const res = await fetch(`${AMAP_HOST}/v3/geocode/regeo?${q}`, { headers: { 'User-Agent': 'dalian-demo/1.0' } });
  const json = await res.json().catch(() => ({}));
  if (json.status !== '1') throw httpError(502, `高德逆地理编码失败：${json.info || '未知错误'}（${json.infocode || ''}）`);
  const rc = json.regeocode || {};
  return { address: rc.formatted_address || '', component: rc.addressComponent || {} };
}

/** QPS 超限等可重试错误：指数退避重试 */
async function withRetry(fn, retries = 3, baseDelay = 800) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const retryable = e.code === '10021' || /CUQPS|QPS|TOO_FREQUENT|ACCESS_TOO_FREQUENT/i.test(e.message || '');
      if (!retryable || i === retries) throw e;
      await new Promise((r) => setTimeout(r, baseDelay * (i + 1)));
    }
  }
  throw lastErr;
}

async function getMapImage({ lon, lat, w = 420, h = 280, zoom = 15 }) {
  assertInDalian(lon, lat);
  const width = clampInt(w, 120, 1024);
  const height = clampInt(h, 120, 1024);
  const z = clampInt(zoom, 3, 17);
  const key = `img|amap|${lon}|${lat}|${width}|${height}|${z}`;
  const out = await cached(key, 7 * 24 * 3600 * 1000, async () => {
    await throttle();
    stats.upstream++;
    return withRetry(() => amapStaticImage({ lon, lat, w: width, h: height, zoom: z }));
  });
  return { ...out, width, height, zoom: z };
}
async function getRegeo(lon, lat) {
  assertInDalian(lon, lat);
  const key = `regeo|amap|${lon}|${lat}`;
  const out = await cached(key, 24 * 3600 * 1000, async () => {
    await throttle();
    stats.upstream++;
    return Buffer.from(JSON.stringify(await withRetry(() => amapRegeo(lon, lat))), 'utf8');
  });
  return { json: JSON.parse(out.buf.toString('utf8')), cache: out.cache };
}

/* ============ 工具 ============ */
function clampInt(v, min, max) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json; charset=utf-8',
};
function sendJson(res, data, status = 200, extra = {}) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}

/* ============ Key 自检：判断前端 Key 是否真的是「Web端(JS API)」类型 ============ */
async function probeKey(key) {
  if (!key) return { configured: false };
  const url = `https://restapi.amap.com/v3/ip?key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const json = await res.json().catch(() => ({}));
    return { configured: true, status: json.status, info: json.info, infocode: json.infocode };
  } catch (e) {
    return { configured: true, error: e.message };
  }
}
async function readFrontendJsKey() {
  try {
    const txt = await readFile(path.join(PUB_DIR, 'config.js'), 'utf8');
    const m = txt.match(/AMAP_JS_KEY\s*:\s*'([^']*)'/) || txt.match(/AMAP_JS_KEY\s*:\s*"([^"]*)"/);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

/* ============ 房源数据 ============ */
let PLACES = [];
const ORIENT = ['南', '南北', '东南', '西南', '东', '西', '北'];
const DECOR = ['精装', '简装', '豪装', '毛坯'];
const FEATURE = ['近地铁', '电梯房', '南北通透', '采光好', '拎包入住', '有车位', '低密社区', '配套成熟', '看海', '公园旁'];

async function loadPlaces() {
  const raw = await readFile(path.join(DATA_DIR, 'places.json'), 'utf8');
  const base = JSON.parse(raw);
  PLACES = base.map((p, i) => {
    // 数据自带 GCJ-02 就直接用（高德采集），否则按 WGS-84 纠偏
    const isGcj = p.coordSys === 'GCJ02';
    const [glon, glat] = isGcj ? [p.lon, p.lat] : wgs84ToGcj02(p.lon, p.lat);
    const seed = p.id;
    return {
      id: p.id,
      name: p.name,
      address: p.address,
      district: p.district || ((p.address || '').includes('金州区') ? '金州区' : '大连市区'),
      lon: glon, lat: glat,                            // 高德坐标（前端直接用）
      coordSys: isGcj ? 'GCJ02' : 'WGS84',
      wgsLon: isGcj ? null : p.lon,
      wgsLat: isGcj ? null : p.lat,
      // 房源演示字段：数据源里没有就从索引确定性生成（保证刷新不变）
      price: p.price || 1200 + ((i * 137) % 2600),
      area: p.area || 38 + ((i * 13) % 88),
      rooms: p.rooms || 1 + ((i * 5) % 3),
      floor: p.floor || 2 + ((i * 3) % 28),
      totalFloor: 6 + ((i * 7) % 28),
      orient: ORIENT[i % ORIENT.length],
      decor: DECOR[i % DECOR.length],
      year: 1998 + ((i * 3) % 26),
      subwayM: 200 + ((i * 173) % 1800),               // 距最近地铁站（米，演示数据）
      feature: [FEATURE[i % FEATURE.length], FEATURE[(i * 3 + 2) % FEATURE.length]],
      updated: p.updated,
      coverH: 380 + ((i * 97) % 320),                   // 瀑布流封面高度（像素，600 宽）
    };
  });
  console.log(`[data] 载入 ${PLACES.length} 条房源，坐标已转换为 GCJ-02`);
}

/* ============ HTTP ============ */
const server = createServer(async (req, res) => {
  const started = Date.now();
  const ip = req.socket.remoteAddress || 'unknown';
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  res.on('finish', () => {
    if (pathname.startsWith('/api/')) console.log(`${req.method} ${pathname}${url.search} -> ${res.statusCode} ${Date.now() - started}ms`);
  });

  try {
    if (pathname.startsWith('/api/')) {
      if (rateLimited(ip)) return sendJson(res, { error: '请求过于频繁，请稍后再试' }, 429, { 'Retry-After': '30' });

      /* 前端需要知道后端 Key 是否已配置 */
      if (pathname === '/api/config-status') {
        return sendJson(res, {
          provider: 'amap',
          mapImageReady: Boolean(AMAP_KEY),
          hint: AMAP_KEY ? '' : '请在 config.server.json 填写 amapWebKey 后重启 node server.mjs',
          bbox: BBOX,
          total: PLACES.length,
        });
      }

      /* Key 自检：前端 Key 类型 / 后端 Key 是否可用 */
      if (pathname === '/api/diag') {
        const jsKey = await readFrontendJsKey();
        const [web, js] = await Promise.all([probeKey(AMAP_KEY), probeKey(jsKey)]);
        const verdict = [];
        if (!web.configured) verdict.push('后端 amapWebKey 未配置（config.server.json）');
        else if (web.status === '1') verdict.push('后端 Web 服务 Key 可用');
        else verdict.push(`后端 Web 服务 Key 异常：${web.info}(${web.infocode})`);

        if (!js.configured) verdict.push('前端 AMAP_JS_KEY 未填写（public/config.js）');
        else if (js.status === '1') verdict.push('⚠ 前端这把 Key 是「Web服务」类型，不能用于 JS API 地图，请改为「Web端(JS API)」');
        else if (js.infocode === '10007') verdict.push('前端 Key 类型正确（Web端 JS API）：用 Web 服务接口探测返回平台不匹配，属正常');
        else if (js.infocode === '10001') verdict.push('⚠ 前端 Key 无效（INVALID_USER_KEY），检查是否复制完整');
        else verdict.push(`前端 Key 探测：${js.info}(${js.infocode})`);

        return sendJson(res, {
          webKey: { ...web, keyTail: AMAP_KEY ? '****' + AMAP_KEY.slice(-4) : '' },
          jsKey: { ...js, keyTail: jsKey ? '****' + jsKey.slice(-4) : '' },
          verdict,
        });
      }

      /* 分页列表 */
      if (pathname === '/api/feed') {
        const page = Math.max(1, clampInt(url.searchParams.get('page') || 1, 1, 999));
        const size = clampInt(url.searchParams.get('size') || 12, 1, 24);
        const total = PLACES.length;
        const startIdx = (page - 1) * size;
        const items = PLACES.slice(startIdx, startIdx + size).map((p) => ({
          ...p,
          mapThumb: AMAP_KEY ? `/api/map/image?id=${p.id}&w=420&h=280&zoom=15` : null,
        }));
        return sendJson(res, { page, size, total, hasMore: startIdx + size < total, items, mapImageReady: Boolean(AMAP_KEY), servedAt: new Date().toISOString() });
      }

      /* 详情 */
      const mPlace = pathname.match(/^\/api\/(?:house|place)\/([\w-]+)$/);
      if (mPlace) {
        const p = PLACES.find((x) => x.id === mPlace[1]);
        if (!p) return sendJson(res, { error: '未找到该房源' }, 404);
        return sendJson(res, {
          ...p,
          mapLarge: AMAP_KEY ? `/api/map/image?id=${p.id}&w=760&h=460&zoom=16` : null,
          mapImageReady: Boolean(AMAP_KEY),
          regeoUrl: `/api/map/regeo?lon=${p.lon}&lat=${p.lat}`,
        });
      }

      /* 静态图 */
      if (pathname === '/api/map/image') {
        const id = url.searchParams.get('id');
        let lon = Number(url.searchParams.get('lon'));
        let lat = Number(url.searchParams.get('lat'));
        if (id) {
          const p = PLACES.find((x) => x.id === id);
          if (!p) return sendJson(res, { error: '未知房源 id' }, 404);
          lon = p.lon; lat = p.lat;
        }
        const out = await getMapImage({ lon, lat, w: url.searchParams.get('w'), h: url.searchParams.get('h'), zoom: url.searchParams.get('zoom') });
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': out.buf.length,
          'Cache-Control': 'public, max-age=604800',
          'X-Map-Cache': out.cache,
        });
        return res.end(out.buf);
      }

      /* 逆地理编码 */
      if (pathname === '/api/map/regeo') {
        const lon = Number(url.searchParams.get('lon'));
        const lat = Number(url.searchParams.get('lat'));
        const out = await getRegeo(lon, lat);
        return sendJson(res, { ...out.json, cache: out.cache });
      }

      /* 统计 */
      if (pathname === '/api/stats') {
        const hits = stats.hitMem + stats.hitDisk;
        return sendJson(res, {
          ...stats,
          uptimeSec: Math.round((Date.now() - stats.startedAt) / 1000),
          hitRate: hits + stats.miss ? `${((hits / (hits + stats.miss)) * 100).toFixed(0)}%` : '0%',
          places: PLACES.length,
          mapImageReady: Boolean(AMAP_KEY),
          keyConfigured: Boolean(AMAP_KEY),
        });
      }

      if (pathname === '/api/cache/clear' && req.method === 'POST') {
        memCache.clear();
        return sendJson(res, { ok: true, message: '内存缓存已清空（磁盘缓存保留）' });
      }

      return sendJson(res, { error: '未知接口' }, 404);
    }

    /* 工程根下的静态目录：/assets/*（图片）、/vendor/*（汇总的第三方运行时） */
    const extraAbs = resolveExtraRoot(pathname);
    if (extraAbs) {
      const buf = await readFile(extraAbs);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(extraAbs).toLowerCase()] || 'application/octet-stream',
        'Content-Length': buf.length,
        'Cache-Control': 'public, max-age=3600',
      });
      return res.end(buf);
    }

    /* 静态文件 */
    let filePath = pathname === '/' ? '/index.html' : pathname;
    if (!path.extname(filePath)) filePath += '.html';
    const abs = path.join(PUB_DIR, path.normalize(filePath).replace(/^([/\\])+/, ''));
    if (!abs.startsWith(PUB_DIR)) return sendJson(res, { error: '非法路径' }, 403);
    const buf = await readFile(abs);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  } catch (err) {
    if (err.code === 'ENOENT') return sendJson(res, { error: '资源不存在' }, 404);
    console.error('[error]', err.message);
    sendJson(res, { error: err.message || '服务器错误' }, err.status || 500);
  }
});

await mkdir(CACHE_DIR, { recursive: true });
await loadPlaces();
server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  栖居 RentHub 前端（v2 + assets）已启动');
  console.log(`  首页： http://${HOST}:${PORT}/`);
  console.log(`  高德 Web 服务 Key：${AMAP_KEY ? '已配置' : '未配置（请填 config.server.json）'}`);
  console.log('  静态根：public/（页面）· assets/（图片）· vendor/（vue/vue-router/antd/dayjs）');
  console.log('');
});





