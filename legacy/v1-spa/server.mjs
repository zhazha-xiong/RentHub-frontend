#!/usr/bin/env node
/**
 * 栖居 RentHub —— 零依赖 Node 服务（静态托管 + SPA fallback + REST API）
 *
 *   node server.mjs            # http://127.0.0.1:8788/
 *
 * 职责
 *   1. 托管 public/（前端 SPA）、assets/（实拍图）、vendor/（Vue 运行时）
 *   2. SPA fallback：/house/h-001、/merchant/listings 等前端路由刷新后仍返回 index.html
 *   3. /api/*：房源（统一模型）、收藏、订单、消息、草稿、商家端、管理员端、鉴权
 *   4. 高德代理保留在 server/amap.mjs（本期不渲染地图）
 *
 * 不需要 npm install，不需要构建工具。
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { init as initStore } from './server/store.mjs';
import { handleApi, sendJson, replayEdits, replayNewHouses, buildHouseIndex } from './server/api.mjs';
import { handleMapApi, setKey as setAmapKey } from './server/amap.mjs';
import * as catalog from './server/data/catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB_DIR = path.join(HERE, 'public');
const ASSETS_DIR = path.join(HERE, 'assets');
const VENDOR_DIR = path.join(HERE, 'vendor');

const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const EXTRA_ROOTS = { '/assets/': ASSETS_DIR, '/vendor/': VENDOR_DIR };

function resolveExtraRoot(pathname) {
  for (const [prefix, base] of Object.entries(EXTRA_ROOTS)) {
    if (!pathname.startsWith(prefix)) continue;
    const abs = path.join(base, pathname.slice(prefix.length));
    if (!abs.startsWith(base)) return null;
    return existsSync(abs) ? abs : null;
  }
  return null;
}

/** 限流：按 IP，300 次/分钟 */
const rateMap = new Map();
const RATE_LIMIT = 300;
const RATE_WINDOW = 60_000;
function rateLimited(ip) {
  const now = Date.now();
  let rec = rateMap.get(ip);
  if (!rec || now > rec.reset) { rec = { count: 0, reset: now + RATE_WINDOW }; rateMap.set(ip, rec); }
  return ++rec.count > RATE_LIMIT;
}

async function serveFile(res, abs, { cache = 'no-cache' } = {}) {
  const buf = await readFile(abs);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
    'Content-Length': buf.length,
    'Cache-Control': cache,
  });
  res.end(buf);
}

/* ---------------- 启动 ---------------- */
await initStore();
await catalog.ensure();
replayNewHouses();
buildHouseIndex();
replayEdits();

try {
  const cfg = JSON.parse(await readFile(path.join(HERE, 'config.server.json'), 'utf8'));
  setAmapKey(process.env.AMAP_WEB_KEY || cfg.amapWebKey || '');
} catch { setAmapKey(process.env.AMAP_WEB_KEY || ''); }

const server = createServer(async (req, res) => {
  const started = Date.now();
  const ip = req.socket.remoteAddress || 'unknown';
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { res.writeHead(400).end('bad request'); return; }
  const pathname = decodeURIComponent(url.pathname);

  res.on('finish', () => {
    if (pathname.startsWith('/api/')) {
      console.log(`${req.method} ${pathname}${url.search} -> ${res.statusCode} ${Date.now() - started}ms`);
    }
  });

  try {
    if (pathname.startsWith('/api/')) {
      if (rateLimited(ip)) return sendJson(res, { error: '请求过于频繁，请稍后再试' }, 429, { 'Retry-After': '30' });

      if (await handleMapApi(req, res, url, sendJson, catalog.all)) return;

      const handled = await handleApi(req, res, url);
      if (handled === false && !res.writableEnded) return sendJson(res, { error: '未知接口' }, 404);
      return;
    }

    const extra = resolveExtraRoot(pathname);
    if (extra) return serveFile(res, extra, { cache: 'public, max-age=3600' });

    /* 静态文件；找不到且是页面请求 → SPA fallback 到 index.html */
    const rel = pathname === '/' ? '/index.html' : pathname;
    const abs = path.join(PUB_DIR, path.normalize(rel).replace(/^([/\\])+/, ''));
    if (!abs.startsWith(PUB_DIR)) return sendJson(res, { error: '非法路径' }, 403);

    if (existsSync(abs) && !pathname.endsWith('/')) return serveFile(res, abs);

    const accept = String(req.headers.accept || '');
    if (accept.includes('text/html') || !path.extname(pathname)) {
      return serveFile(res, path.join(PUB_DIR, 'index.html'));
    }
    return sendJson(res, { error: '资源不存在' }, 404);
  } catch (err) {
    if (err.code === 'ENOENT') return sendJson(res, { error: '资源不存在' }, 404);
    console.error('[error]', pathname, err.message);
    if (!res.writableEnded) sendJson(res, { error: err.message || '服务器错误' }, err.status || 500);
  }
});

await new Promise((r) => server.listen(PORT, HOST, r));

const s = catalog.summary();
console.log('');
console.log('  栖居 RentHub（Vue 3 + Vue Router）已启动');
console.log(`  地址：   http://${HOST}:${PORT}/`);
console.log(`  数据源： ${catalog.state.source}（${catalog.state.description}）· 房源 ${s.total} 条 / 在架 ${s.listed} 条`);
console.log('  静态：   public/（SPA）· assets/（实拍图）· vendor/（Vue 运行时，无需 npm install）');
console.log('  状态：   runtime/store.json（收藏 / 订单 / 消息 / 草稿 / 登录态，重启不丢）');
console.log('  高德：   代理已保留（/api/map/*），本期前端不渲染地图');
console.log('');
