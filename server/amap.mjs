/**
 * 高德地图代理（保留能力，本期不接 UI）
 *
 * 为什么留：交接文档要求「高德地图能力（前端范式 + 后端代理）完整保留」。
 * 本期前端只在数据层保留 lon/lat，不渲染地图；等接入时直接调这些接口即可。
 * Key 只出现在后端配置文件里，前端永远拿不到。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(HERE, 'cache');
const AMAP_HOST = 'https://restapi.amap.com';
const BBOX = { minLon: 121.0, maxLon: 122.6, minLat: 38.6, maxLat: 40.0 };

let AMAP_KEY = '';
export function setKey(k) { AMAP_KEY = (k || '').trim(); }
export function keyConfigured() { return Boolean(AMAP_KEY); }

/* ---------------- 缓存 / 节流 ---------------- */
const memCache = new Map();
const inflight = new Map();
const MEM_LIMIT = 200;
const stats = { hitMem: 0, hitDisk: 0, miss: 0, upstream: 0, dedup: 0, rateLimited: 0, startedAt: Date.now() };

let nextSlot = 0;
const MIN_GAP = Number(process.env.UPSTREAM_GAP_MS || 500);
async function throttle() {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_GAP;
  const wait = slot - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function cached(key, ttl, producer) {
  const hash = createHash('sha1').update(key).digest('hex');
  const file = path.join(CACHE_DIR, hash + '.bin');
  const mem = memCache.get(hash);
  if (mem && mem.expire > Date.now()) { stats.hitMem++; return { buf: mem.value, cache: 'mem' }; }
  try {
    const buf = await readFile(file);
    memCache.set(hash, { expire: Date.now() + ttl, value: buf });
    trim();
    stats.hitDisk++;
    return { buf, cache: 'disk' };
  } catch { /* miss */ }
  if (inflight.has(hash)) { stats.dedup++; return inflight.get(hash); }
  const p = (async () => {
    try {
      stats.miss++;
      const buf = await producer();
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, buf).catch(() => {});
      memCache.set(hash, { expire: Date.now() + ttl, value: buf });
      trim();
      return { buf, cache: 'miss' };
    } finally { inflight.delete(hash); }
  })();
  inflight.set(hash, p);
  return p;
}
function trim() {
  if (memCache.size <= MEM_LIMIT) return;
  let over = memCache.size - MEM_LIMIT;
  for (const k of memCache.keys()) { if (over-- <= 0) break; memCache.delete(k); }
}

function clampInt(v, min, max) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function requireKey() {
  if (!AMAP_KEY) throw httpError(503, '后端未配置高德 Web 服务 Key：请填写 config.server.json 的 amapWebKey 后重启服务');
}
function assertInDalian(lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw httpError(400, '经纬度参数错误');
  if (lon < BBOX.minLon || lon > BBOX.maxLon || lat < BBOX.minLat || lat > BBOX.maxLat) {
    throw httpError(400, `坐标超出大连市范围（允许 lon ${BBOX.minLon}~${BBOX.maxLon}, lat ${BBOX.minLat}~${BBOX.maxLat}）`);
  }
}

/* ---------------- 上游 ---------------- */
async function amapStaticImage({ lon, lat, w, h, zoom }) {
  requireKey();
  const q = new URLSearchParams({
    location: `${lon},${lat}`, zoom: String(zoom), size: `${w}*${h}`, scale: '1',
    markers: `mid,0x0F766E,A:${lon},${lat}`, key: AMAP_KEY,
  });
  const res = await fetch(`${AMAP_HOST}/v3/staticmap?${q}`, { headers: { 'User-Agent': 'renthub/1.0' } });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || !ct.includes('image')) {
    const txt = await res.text().catch(() => '');
    throw httpError(502, `高德静态图失败（${res.status}）：${txt.slice(0, 160)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) throw httpError(502, '高德静态图内容异常');
  return buf;
}
async function amapRegeo(lon, lat) {
  requireKey();
  const q = new URLSearchParams({ location: `${lon},${lat}`, extensions: 'base', key: AMAP_KEY });
  const res = await fetch(`${AMAP_HOST}/v3/geocode/regeo?${q}`, { headers: { 'User-Agent': 'renthub/1.0' } });
  const json = await res.json().catch(() => ({}));
  if (json.status !== '1') throw httpError(502, `高德逆地理编码失败：${json.info || '未知错误'}`);
  const rc = json.regeocode || {};
  return { address: rc.formatted_address || '', component: rc.addressComponent || {} };
}
async function probeKey(key) {
  if (!key) return { configured: false };
  try {
    const res = await fetch(`https://restapi.amap.com/v3/ip?key=${encodeURIComponent(key)}`, { headers: { 'User-Agent': 'renthub/1.0' } });
    const json = await res.json().catch(() => ({}));
    return { configured: true, status: json.status, info: json.info, infocode: json.infocode };
  } catch (e) { return { configured: true, error: e.message }; }
}

/* ---------------- 路由 ---------------- */
/**
 * @param {(res:any,data:any,status?:number,extra?:object)=>void} sendJson
 * @param {() => any[]} allHouses 取当前房源（用于按 id 查坐标）
 * @returns {Promise<boolean>} 是否已处理
 */
export async function handleMapApi(req, res, url, sendJson, allHouses) {
  const p = url.pathname;
  const q = url.searchParams;

  if (p === '/api/config-status') {
    sendJson(res, {
      provider: 'amap',
      mapImageReady: Boolean(AMAP_KEY),
      hint: AMAP_KEY ? '' : '请在 config.server.json 填写 amapWebKey 后重启服务',
      bbox: BBOX,
      enabledUI: false,
      note: '本期前端不渲染地图，仅保留代理能力；房源数据已带 GCJ-02 坐标',
    });
    return true;
  }

  if (p === '/api/diag') {
    const web = await probeKey(AMAP_KEY);
    const verdict = [];
    if (!web.configured) verdict.push('后端 amapWebKey 未配置（config.server.json）');
    else if (web.status === '1') verdict.push('后端 Web 服务 Key 可用');
    else verdict.push(`后端 Web 服务 Key 异常：${web.info}(${web.infocode})`);
    sendJson(res, { webKey: { ...web, keyTail: AMAP_KEY ? '****' + AMAP_KEY.slice(-4) : '' }, verdict });
    return true;
  }

  if (p === '/api/map/image') {
    const id = q.get('id');
    let lon = Number(q.get('lon'));
    let lat = Number(q.get('lat'));
    if (id) {
      const h = (allHouses() || []).find((x) => x.id === id);
      if (!h) { sendJson(res, { error: '未知房源 id' }, 404); return true; }
      lon = h.coord.lon; lat = h.coord.lat;
    }
    assertInDalian(lon, lat);
    const w = clampInt(q.get('w'), 120, 1024);
    const h2 = clampInt(q.get('h'), 120, 1024);
    const z = clampInt(q.get('zoom'), 3, 17);
    const out = await cached(`img|${lon}|${lat}|${w}|${h2}|${z}`, 7 * 24 * 3600 * 1000, async () => {
      await throttle(); stats.upstream++;
      return amapStaticImage({ lon, lat, w, h: h2, zoom: z });
    });
    res.writeHead(200, {
      'Content-Type': 'image/png', 'Content-Length': out.buf.length,
      'Cache-Control': 'public, max-age=604800', 'X-Map-Cache': out.cache,
    });
    res.end(out.buf);
    return true;
  }

  if (p === '/api/map/regeo') {
    const lon = Number(q.get('lon'));
    const lat = Number(q.get('lat'));
    assertInDalian(lon, lat);
    const out = await cached(`regeo|${lon}|${lat}`, 24 * 3600 * 1000, async () => {
      await throttle(); stats.upstream++;
      return Buffer.from(JSON.stringify(await amapRegeo(lon, lat)), 'utf8');
    });
    sendJson(res, { ...JSON.parse(out.buf.toString('utf8')), cache: out.cache });
    return true;
  }

  if (p === '/api/stats') {
    const hits = stats.hitMem + stats.hitDisk;
    sendJson(res, {
      ...stats,
      uptimeSec: Math.round((Date.now() - stats.startedAt) / 1000),
      hitRate: hits + stats.miss ? `${((hits / (hits + stats.miss)) * 100).toFixed(0)}%` : '0%',
      keyConfigured: Boolean(AMAP_KEY),
    });
    return true;
  }

  if (p === '/api/cache/clear' && req.method === 'POST') {
    memCache.clear();
    sendJson(res, { ok: true, message: '内存缓存已清空（磁盘缓存保留）' });
    return true;
  }

  return false;
}
