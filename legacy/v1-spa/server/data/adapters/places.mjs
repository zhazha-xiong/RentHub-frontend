/**
 * 适配器 B：places.json（高德采集的大连住宅 POI，175 条，GCJ-02）
 *
 * 两个用途：
 *   1. 坐标字典 —— catalog 用它在每个行政区算出坐标锚点，给没有经纬度的数据源
 *      （如 v2 演示数据）补上真实的大连坐标；也提供「按小区名匹配 POI」的能力。
 *   2. 备用数据源 —— CATALOG_SOURCE=places 时直接用这 175 条 POI 当房源列表，
 *      用来验证「前端不认数据源、只认统一模型」。
 */
import { readFile } from 'node:fs/promises';

const IMG_POOL = [
  '/assets/modern-living-room-with-stylish-furniture-and.jpg',
  '/assets/living-room-in-apartment-of-condominio-do.jpg',
  '/assets/the-living-room-that-needs-houseplants.jpg',
  '/assets/new-orleans-french-quarter-apartment-living-room.jpg',
  '/assets/bedroom-interior-of-apartment-in-brisbane-2025.jpg',
  '/assets/bedroom-interior-of-apartment-in-brisbane-2025-2.jpg',
  '/assets/kitchen-interior-of-apartment-in-brisbane-2025.jpg',
  '/assets/apartment-kitchen-5170875449.jpg',
  '/assets/apartment-building-in-china.jpg',
];
const ORIENT = ['朝南', '南北', '东南', '西南', '朝东', '朝西', '朝北'];
const DECOR = ['精装', '简装', '豪装'];
const FEATURE = ['近地铁', '电梯房', '南北通透', '采光好', '拎包入住', '有车位', '低密社区', '配套成熟', '看海', '公园旁'];

let CACHE = null;

/** 只做「读 + 解析」，不归一化 */
export async function parse(file) {
  if (CACHE) return CACHE;
  const raw = JSON.parse(await readFile(file, 'utf8'));
  CACHE = Array.isArray(raw) ? raw : [];
  return CACHE;
}

/** 区名归一：'中山区' → '中山'，用于和前端筛选项对齐 */
export function shortDistrict(d = '') {
  return String(d).replace(/区$/, '').replace('高新园区', '高新园区');
}

/** 给数据源补坐标：按「区质心 + 确定性偏移」生成，刷新不变 */
export function districtAnchors(places) {
  const acc = new Map();
  for (const p of places) {
    if (!Number.isFinite(p.lon) || !Number.isFinite(p.lat)) continue;
    const d = shortDistrict(p.district);
    const cur = acc.get(d) || { lon: 0, lat: 0, n: 0 };
    cur.lon += p.lon; cur.lat += p.lat; cur.n++;
    acc.set(d, cur);
  }
  const out = new Map();
  for (const [d, v] of acc) out.set(d, { lon: +(v.lon / v.n).toFixed(6), lat: +(v.lat / v.n).toFixed(6) });
  return out;
}

/** 通过小区名在 POI 里找坐标（名称互相包含即算命中） */
export function findByCommunity(places, name, district) {
  const n = String(name || '').trim();
  if (!n) return null;
  const d = shortDistrict(district);
  const cands = places.filter((p) => !d || shortDistrict(p.district) === d);
  const hit = cands.find((p) => p.name === n)
    || cands.find((p) => p.name.includes(n) || n.includes(p.name));
  return hit ? { lon: hit.lon, lat: hit.lat, sys: 'GCJ02', ref: hit.id } : null;
}

/**
 * 备用数据源：把 POI 变成房源。
 * 这里刻意用「POI 原始字段名」输出少量字段，其余全靠 normalizeHouse() 兼容补全，
 * 用来证明兼容器能吃下另一种结构。
 */
export async function load({ dataDir }) {
  const places = await parse(`${dataDir}/places.json`);
  return places.map((p, i) => {
    const rent = 1200 + ((i * 137) % 2600);
    const areaSize = 38 + ((i * 13) % 88);
    const rooms = 1 + ((i * 5) % 3);
    const floor = 2 + ((i * 3) % 28);
    const totalFloor = 6 + ((i * 7) % 28);
    const img = IMG_POOL[i % IMG_POOL.length];
    return {
      /* 故意用「不确定后端」的字段名：id/name/address 直接来自 POI */
      id: p.id,
      name: p.name,
      address: p.address,
      longitude: p.lon,
      latitude: p.lat,
      coordSys: p.coordSys || 'GCJ02',
      region: shortDistrict(p.district),
      community: p.name,
      price: rent,
      size: areaSize,
      roomText: `${rooms} 室 1 厅 1 卫`,
      floorText: `${floor} / ${totalFloor} 层`,
      orientation: ORIENT[i % ORIENT.length],
      decoration: DECOR[i % DECOR.length],
      labels: [FEATURE[i % FEATURE.length], FEATURE[(i * 3 + 2) % FEATURE.length]],
      cover: img,
      ratio: i % 3 === 0 ? '4/3' : '1/1',
      elevator: i % 2 === 0,
      updated: `${(i % 12) + 1} 天前`,
      status: '在架',
      views: 20 + ((i * 17) % 260),
      favorites: (i * 3) % 21,
      rentType: i % 5 === 0 ? '合租/单间' : '整租',
      houseType: i % 7 === 0 ? '公寓' : '普通住宅',
      agent: { id: 'm-002', name: '海滨小屋', verified: true, responseText: '资质已认证 · 平均响应 3 小时' },
      listing_ratio: i % 3 === 0 ? '4/3' : '1/1',
      source: { provider: 'places.json', ref: p.id },
    };
  });
}

export const meta = { provider: 'places.json', title: '大连住宅 POI（175 条）', file: 'places.json' };
