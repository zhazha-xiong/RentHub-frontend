/**
 * 房源目录（catalog）：把任意数据源收敛成「统一模型数组」+ 查询能力
 *
 * 数据源由 CATALOG_SOURCE 环境变量选择：
 *   v2-demo（默认） → adapters/v2demo.mjs 的 9 条演示房源
 *   places          → adapters/places.mjs 的 175 条大连 POI
 * 不论选哪个，下游（API / 前端）看到的都是同一形状。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeHouse, fillFacilities, DISTRICTS } from './schema.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, '..', '..', 'data');
import * as v2demo from './adapters/v2demo.mjs';
import * as placesAdapter from './adapters/places.mjs';

const ADAPTERS = { 'v2-demo': v2demo, places: placesAdapter };

/** 确定性伪随机：同一字符串永远得到同一个 0~1 小数（保证刷新坐标不变） */
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

export const state = {
  source: '',
  description: '',
  loadedAt: null,
  houses: [],
  byId: new Map(),
  anchors: new Map(),
  geoRefs: new Map(),
};

let ready = null;

async function build() {
  const dataDir = DATA_DIR;
  const requested = (process.env.CATALOG_SOURCE || 'v2-demo').trim();
  const adapter = ADAPTERS[requested] || v2demo;
  state.source = adapter.meta.provider;
  state.description = adapter.meta.title;

  /* 坐标字典来自 places.json（无论主数据源是谁） */
  const places = await placesAdapter.parse(path.join(dataDir, 'places.json'));
  state.anchors = placesAdapter.districtAnchors(places);

  const rawList = await adapter.load({ dataDir, places });
  const houses = [];

  for (const raw of rawList) {
    let house;
    try {
      house = normalizeHouse(raw, { provider: adapter.meta.provider });
    } catch (err) {
      console.warn('[catalog] 跳过一条不合规数据：', err.message);
      continue;
    }

    /* ---- 坐标解析三级兜底：数据自带 → POI 名称匹配 → 区质心 + 确定性偏移 ---- */
    if (!Number.isFinite(house.coord.lon) || !Number.isFinite(house.coord.lat)) {
      const byName = placesAdapter.findByCommunity(places, house.place.area, house.place.district);
      if (byName) {
        house.coord = { lon: byName.lon, lat: byName.lat, sys: 'GCJ02' };
        state.geoRefs.set(house.id, { how: 'poi-name', ref: byName.ref });
      } else {
        const anchor = state.anchors.get(house.place.district) || { lon: 121.6147, lat: 38.914 };
        const rix = hash01(house.id + 'lon');
        const riy = hash01(house.id + 'lat');
        house.coord = {
          lon: +(anchor.lon + (rix - 0.5) * 0.05).toFixed(6),
          lat: +(anchor.lat + (riy - 0.5) * 0.035).toFixed(6),
          sys: 'GCJ02',
        };
        state.geoRefs.set(house.id, { how: 'district-anchor', district: house.place.district });
      }
    } else {
      state.geoRefs.set(house.id, { how: 'source' });
    }
    house.coord.sys = house.coord.sys || 'GCJ02';

    fillFacilities(house);

    /* 商家在架数量由目录实时统计，避免写死 */
    house.merchant.listings = 0;
    houses.push(house);
  }

  for (const h of houses) {
    const m = houses.filter((x) => x.merchant.id === h.merchant.id);
    h.merchant.listings = m.length;
  }

  state.houses = houses;
  state.byId = new Map(houses.map((h) => [h.id, h]));
  state.loadedAt = new Date().toISOString();
  console.log(`[catalog] 数据源=${state.source}（${state.description}），载入 ${houses.length} 条，坐标已统一为 GCJ-02`);
}

export function ensure() {
  if (!ready) ready = build();
  return ready;
}

/* ---------------- 查询能力 ---------------- */

export function all() { return state.houses; }

export function get(id) { return state.byId.get(id) || null; }

/** 商家新建房源时插入目录（内存索引同步更新，重启后由 store 重放） */
export function insert(house) {
  state.houses.unshift(house);
  state.byId.set(house.id, house);
  return house;
}

/** 商家视角：某商家的房源 */
export function byMerchant(merchantId) {
  return state.houses.filter((h) => h.merchant.id === merchantId);
}

/** 统计：在架数、今日新上 */
export function summary() {
  const listed = state.houses.filter((h) => h.listing.status === '在架');
  return {
    total: state.houses.length,
    listed: listed.length,
    todayNew: state.houses.filter((h) => /今天/.test(h.listing.updatedLabel)).length,
    districts: [...new Set(state.houses.map((h) => h.place.district))].filter(Boolean),
  };
}

const SORTS = {
  default: (a, b) => 0,
  newest: (a, b) => rankUpdated(a) - rankUpdated(b),
  price_asc: (a, b) => a.pricing.rent - b.pricing.rent,
  price_desc: (a, b) => b.pricing.rent - a.pricing.rent,
};
function rankUpdated(h) {
  const t = h.listing.updatedLabel;
  if (/今天/.test(t)) return 0;
  if (/昨天/.test(t)) return 1;
  const m = String(t).match(/(\d+)\s*天/);
  return m ? 2 + Number(m[1]) : 99;
}

/**
 * 列表查询：全部条件都来自 URL query，前端不保存状态也能还原。
 * @param {object} q { page, size, district, metro, rentMin, rentMax, rooms, rentType,
 *                     type, orient, elevator, q, sort, tag }
 */
export function query(q = {}) {
  let list = state.houses.filter((h) => h.listing.status !== '已下架');

  const district = String(q.district || '').trim();
  if (district && district !== '全部') list = list.filter((h) => h.place.district === district);

  const metro = String(q.metro || '').trim();
  if (metro && metro !== '全部') list = list.filter((h) => h.place.metro.line.replace(/\s/g, '') === metro.replace(/\s/g, ''));

  const rentMin = Number(q.rentMin), rentMax = Number(q.rentMax);
  if (Number.isFinite(rentMin) && rentMin > 0) list = list.filter((h) => h.pricing.rent >= rentMin);
  if (Number.isFinite(rentMax) && rentMax > 0) list = list.filter((h) => h.pricing.rent <= rentMax);

  const rooms = String(q.rooms || '').trim();
  if (rooms && rooms !== '全部') {
    const want = rooms.includes('五室') || rooms.includes('5') ? 5 : Number(String(rooms).replace(/[^\d]/g, ''));
    if (want === 5) list = list.filter((h) => h.spec.rooms >= 5);
    else if (Number.isFinite(want) && want > 0) list = list.filter((h) => h.spec.rooms === want);
  }

  const rentType = String(q.rentType || '').trim();
  if (rentType && rentType !== '全部') list = list.filter((h) => h.spec.rentType === rentType);

  const type = String(q.type || '').trim();
  if (type && type !== '全部' && type !== '房屋类型') list = list.filter((h) => h.spec.type === type);

  const orient = String(q.orient || '').trim();
  if (orient && orient !== '全部' && orient !== '朝向') list = list.filter((h) => h.spec.orient === orient);

  if (String(q.elevator || '') === '1') list = list.filter((h) => h.spec.elevator);

  const kw = String(q.q || '').trim();
  if (kw) {
    list = list.filter((h) => [h.title, h.meta, h.place.area, h.place.address, h.place.district]
      .join(' ').includes(kw));
  }

  const tag = String(q.tag || '').trim();
  if (tag) list = list.filter((h) => h.tags.some((t) => t.text === tag));

  const sortFn = SORTS[q.sort] || SORTS.default;
  list = [...list].sort(sortFn);

  const size = Math.min(48, Math.max(1, Number(q.size) || 12));
  const total = list.length;
  const page = Math.max(1, Number(q.page) || 1);
  const start = (page - 1) * size;
  const items = list.slice(start, start + size);

  return { page, size, total, hasMore: start + size < total, items };
}

/** 相关推荐：同区优先、价格接近的 3 套 */
export function related(id, limit = 3) {
  const base = get(id);
  if (!base) return [];
  return state.houses
    .filter((h) => h.id !== id && h.listing.status !== '已下架')
    .map((h) => ({
      h,
      score: (h.place.district === base.place.district ? 0 : 1000)
        + Math.abs(h.pricing.rent - base.pricing.rent) / 100
        + (h.spec.rooms === base.spec.rooms ? 0 : 100),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.h);
}

export { DISTRICTS };
