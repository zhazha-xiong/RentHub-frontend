/**
 * 统一房源模型 + 归一化（兼容层核心）
 *
 * 后端真实数据结构目前不确定，所以所有数据源都必须先过 normalizeHouse()：
 * 它接受「各种可能的字段命名」并补全缺省值，输出固定形状的 House 对象。
 * 前端只认这个形状 —— 以后换真后端，只需改 adapters/ 里的映射，前端一行不动。
 *
 * ── 统一 House 形状（前端契约） ─────────────────────────────
 * {
 *   id, code,                                  // 编号（业务主键 / 对外单号前缀）
 *   title, meta,                               // 「星海广场 · 2室1厅」/「沙河口 · 86㎡ · 南北 …」
 *   images: [{ src, alt, ar }],                // ar 是瀑布流卡片封面宽高比 "16/9"
 *   description: { text, kv: [{ k, v }] },
 *   tags: [{ text, kind }],                    // kind: blue | hue | plain | warn | ok
 *   coord: { lon, lat, sys },                  // 高德 GCJ-02
 *   place: { city, district, area, address, metro: { line, walkM } },
 *   spec: { rooms, halls, baths, area, floor, totalFloor, orient, decor, type, rentType, elevator },
 *   pricing: { rent, deposit, serviceFee, payMethod },
 *   availability: { availableFrom, minMonths, viewing, parking },
 *   facilities: { bedroom: [{ icon, label }], public: [...] },
 *   merchant: { id, name, initial, listings, verified, responseText },
 *   listing: { status, updatedLabel, views, favCount },
 *   source: { provider, ref }
 * }
 * ────────────────────────────────────────────────────────────
 */

export const DISTRICTS = ['沙河口', '中山', '西岗', '甘井子', '高新园区', '金州', '开发区', '旅顺口'];
export const RENT_TYPES = ['整租', '合租/单间'];
export const HOUSE_TYPES = ['普通住宅', '公寓', '别墅', '商住两用'];
export const ORIENTS = ['南北', '朝南', '朝东', '朝西', '朝北', '东南', '东西'];
export const DECORS = ['精装', '简装', '豪装', '毛坯'];
export const LISTING_STATUS = ['在架', '已出租', '已下架'];

/** 设施字典：图标 id 与前端 ICON_DEFS 的 <symbol id> 一一对应 */
export const FACILITY_BEDROOM = [
  { icon: 'i-tv', label: '电视' }, { icon: 'i-ac', label: '空调' },
  { icon: 'i-wardrobe', label: '衣柜' }, { icon: 'i-bed', label: '床' },
  { icon: 'i-bath', label: '卫生间' }, { icon: 'i-lock', label: '智能门锁' },
  { icon: 'i-balcony', label: '阳台' }, { icon: 'i-heater', label: '暖气' },
];
export const FACILITY_PUBLIC = [
  { icon: 'i-fridge', label: '冰箱' }, { icon: 'i-washer', label: '洗衣机' },
  { icon: 'i-water', label: '热水器' }, { icon: 'i-wifi', label: '宽带' },
  { icon: 'i-sofa', label: '沙发' }, { icon: 'i-hood', label: '油烟机' },
  { icon: 'i-stove', label: '燃气灶' }, { icon: 'i-cook', label: '可做饭' },
];

/* ---------------- 取值工具：兼容多种命名 ---------------- */
function pick(obj, keys, dflt) {
  if (!obj || typeof obj !== 'object') return dflt;
  for (const k of keys) {
    if (!(k in obj)) continue;
    const v = obj[k];
    if (v === undefined || v === null || v === '') continue;
    return v;
  }
  return dflt;
}
function num(v, dflt = 0) {
  const n = Number(typeof v === 'string' ? v.replace(/[^\d.\-]/g, '') : v);
  return Number.isFinite(n) ? n : dflt;
}
function str(v, dflt = '') {
  if (v === undefined || v === null) return dflt;
  return String(v).trim() || dflt;
}
function arr(v) {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null || v === '') return [];
  return [v];
}
/** 从 "14/26"、"14 / 26 层" 里拆楼层 */
function splitFloor(v) {
  const m = String(v ?? '').match(/(\d+)\s*\/\s*(\d+)/);
  if (m) return [num(m[1]), num(m[2])];
  return [num(v, 0), 0];
}
/** 从 "2 室 1 厅 1 卫"、"2/1/1"、"2室1厅" 里拆户型 */
function splitRooms(raw, spec) {
  const rooms = pick(spec, ['rooms', 'room', 'bedrooms', 'bedroom', 'roomCount'], undefined);
  const halls = pick(spec, ['halls', 'hall', 'livingRooms', 'livingRoom'], undefined);
  const baths = pick(spec, ['baths', 'bath', 'bathrooms', 'bathroom'], undefined);
  if (rooms !== undefined) return [num(rooms, 1), num(halls, 0), num(baths, 0)];
  const text = str(pick(spec, ['layout', 'roomText', 'huxing'], '')) || str(raw.roomText, '');
  const m = text.match(/(\d+)\s*室\s*(\d+)\s*厅(?:\s*(\d+)\s*卫)?/) || text.match(/^(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)$/);
  if (m) return [num(m[1], 1), num(m[2], 0), num(m[3], 0)];
  return [1, 0, 0];
}

/* ---------------- 归一化 ---------------- */
export function normalizeHouse(raw, ctx = {}) {
  if (!raw || typeof raw !== 'object') throw new Error('normalizeHouse: 数据源条目不是对象');
  const id = str(pick(raw, ['id', 'houseId', 'house_id', 'code', 'no', 'uuid'], ''));
  if (!id) throw new Error('normalizeHouse: 缺少主键 id');

  const specSrc = raw.spec || raw.detail || {};
  const priceSrc = raw.pricing || raw.priceInfo || raw;
  const placeSrc = raw.place || raw.location || raw;
  const coordSrc = pick(raw, ['coord', 'coordinate', 'coordinates', 'location', 'geo'], null);

  /* 坐标：支持 {lon,lat} / [lon,lat] / "121.6,38.9" / 平铺字段 */
  let lon = NaN, lat = NaN;
  if (Array.isArray(coordSrc)) { lon = num(coordSrc[0], NaN); lat = num(coordSrc[1], NaN); }
  else if (typeof coordSrc === 'string' && coordSrc.includes(',')) {
    const [a, b] = coordSrc.split(','); lon = num(a, NaN); lat = num(b, NaN);
  } else if (coordSrc && typeof coordSrc === 'object') {
    lon = num(pick(coordSrc, ['lon', 'lng', 'longitude', 'x'], NaN), NaN);
    lat = num(pick(coordSrc, ['lat', 'latitude', 'y'], NaN), NaN);
  }
  if (!Number.isFinite(lon)) lon = num(pick(raw, ['lon', 'lng', 'longitude'], NaN), NaN);
  if (!Number.isFinite(lat)) lat = num(pick(raw, ['lat', 'latitude'], NaN), NaN);

  /* 图片：string | string[] | {src}[] */
  const rawImages = arr(pick(raw, ['images', 'pics', 'photos', 'pictures', 'imgList'], pick(raw, ['cover', 'image', 'thumb'], [])));
  const ratio = str(pick(raw, ['ratio', 'ar', 'aspectRatio'], '4/3'));
  const images = rawImages.map((it, i) => {
    const src = typeof it === 'string' ? it : str(pick(it, ['src', 'url', 'image', 'path'], ''));
    const alt = typeof it === 'string' ? '' : str(pick(it, ['alt', 'title', 'name'], ''));
    const ar = typeof it === 'string' ? (i === 0 ? ratio : '4/3') : str(pick(it, ['ar', 'ratio', 'aspectRatio'], i === 0 ? ratio : '4/3'));
    return src ? { src, alt: alt || '房源室内实拍，教学演示图片', ar } : null;
  }).filter(Boolean);

  /* 标签：string[] | {text,kind}[] */
  const tags = arr(pick(raw, ['tags', 'labels', 'features'], [])).map((t) => {
    if (typeof t === 'string') return { text: t, kind: 'blue' };
    const text = str(pick(t, ['text', 'label', 'name'], ''));
    return text ? { text, kind: str(pick(t, ['kind', 'type', 'style'], 'blue')) } : null;
  }).filter(Boolean);

  const [rooms, halls, baths] = splitRooms(raw, specSrc);
  const [floor, totalFloor] = splitFloor(pick(specSrc, ['floorText', 'floor'], pick(raw, ['floor', 'floorText'], '')));

  const rent = num(pick(priceSrc, ['rent', 'price', 'monthlyRent', 'amount'], 0), 0);
  const area = num(pick(specSrc, ['area', 'size', 'square'], pick(raw, ['area', 'size'], 0)), 0);
  const district = str(pick(placeSrc, ['district', 'region', 'areaName'], pick(raw, ['district', 'region'], '')), '');
  const community = str(pick(placeSrc, ['area', 'community', 'estate', 'name'], pick(raw, ['community', 'estate', 'name'], '')), '');
  const title = str(pick(raw, ['title', 'name', 'houseName'], community ? `${community} · ${rooms}室${halls}厅` : `房源 ${id}`));

  const merchantSrc = raw.merchant || raw.agent || raw.owner || {};
  const merchantName = typeof merchantSrc === 'string' ? merchantSrc : str(pick(merchantSrc, ['name', 'shopName', 'title'], ''), '星辰公寓');

  const descSrc = raw.description || raw.desc || {};
  const descText = typeof descSrc === 'string' ? descSrc : str(pick(descSrc, ['text', 'body', 'content'], ''));

  const meta = str(pick(raw, ['meta', 'summary'], '')) ||
    [district, `${Math.round(area)}㎡`, str(pick(specSrc, ['orient', 'orientation'], '')), totalFloor ? `${floor}/${totalFloor}层` : '', str(pick(specSrc, ['decor', 'decoration'], ''))]
      .filter(Boolean).join(' · ');

  return {
    id,
    code: str(pick(raw, ['code', 'orderPrefix'], 'RH')),
    title,
    meta,
    images,
    cover: images[0]?.src || '',
    description: {
      text: descText,
      kv: arr(pick(descSrc.kv || raw, ['kv', 'terms'], [])).map((x) => ({
        k: str(pick(x, ['k', 'label', 'key'], '')),
        v: str(pick(x, ['v', 'value'], '')),
      })).filter((x) => x.k),
    },
    tags,
    coord: { lon, lat, sys: str(pick(coordSrc || {}, ['sys', 'coordSys'], pick(raw, ['coordSys'], 'GCJ02')), 'GCJ02') },
    place: {
      city: str(pick(placeSrc, ['city'], '大连'), '大连'),
      district,
      area: community,
      address: str(pick(placeSrc, ['address', 'addr', 'fullAddress'], '')),
      metro: {
        line: str(pick(pick(placeSrc, ['metro'], {}) || {}, ['line'], '')),
        walkM: num(pick(pick(placeSrc, ['metro'], {}) || {}, ['walkM', 'walk', 'distance'], 0), 0),
      },
    },
    spec: {
      rooms, halls, baths,
      area,
      floor,
      totalFloor,
      orient: str(pick(specSrc, ['orient', 'orientation'], '')),
      decor: str(pick(specSrc, ['decor', 'decoration'], '')),
      type: str(pick(specSrc, ['type', 'houseType'], pick(raw, ['type'], '普通住宅')), '普通住宅'),
      rentType: str(pick(specSrc, ['rentType', 'leaseType'], pick(raw, ['rentType'], '整租')), '整租'),
      elevator: Boolean(pick(specSrc, ['elevator', 'hasElevator'], pick(raw, ['elevator'], false))),
    },
    pricing: {
      rent,
      deposit: num(pick(priceSrc, ['deposit'], rent), rent),
      serviceFee: num(pick(priceSrc, ['serviceFee'], Math.round(rent * 0.05)), Math.round(rent * 0.05)),
      payMethod: str(pick(priceSrc, ['payMethod', 'pay'], '押一付三'), '押一付三'),
    },
    availability: {
      availableFrom: str(pick(raw, ['availableFrom', 'available', 'checkIn'], '')),
      minMonths: num(pick(raw, ['minMonths'], 6), 6),
      viewing: str(pick(raw, ['viewing'], '随时可看'), '随时可看'),
      parking: str(pick(raw, ['parking'], ''), ''),
    },
    facilities: {
      bedroom: arr(pick(raw, ['facilities', 'facility'], {}).bedroom || []),
      public: arr(pick(raw, ['facilities', 'facility'], {}).public || []),
    },
    merchant: {
      id: str(pick(merchantSrc, ['id'], 'm-001'), 'm-001'),
      name: merchantName,
      initial: merchantName.slice(0, 1),
      listings: num(pick(merchantSrc, ['listings', 'count'], 0), 0),
      verified: Boolean(pick(merchantSrc, ['verified'], true)),
      responseText: str(pick(merchantSrc, ['responseText'], '资质已认证 · 平均响应 1 小时')),
    },
    listing: {
      status: str(pick(raw, ['status', 'listingStatus'], pick(raw.listing || {}, ['status'], '在架')), '在架'),
      updatedLabel: str(pick(raw, ['updatedLabel', 'when', 'updated'], '')),
      views: num(pick(raw, ['views'], 0), 0),
      favCount: num(pick(raw, ['favCount', 'favorites'], 0), 0),
    },
    source: { provider: str(raw.source?.provider, ctx.provider || 'unknown'), ref: str(raw.source?.ref, id) },
  };
}

/** 设施兜底：数据源没给就按「凡是没有的都算有」的演示逻辑补全（保持与 v2 一致的全选状态） */
export function fillFacilities(house, bedroom = FACILITY_BEDROOM, publicFac = FACILITY_PUBLIC) {
  if (!house.facilities.bedroom.length) house.facilities.bedroom = bedroom.map((x) => ({ ...x }));
  if (!house.facilities.public.length) house.facilities.public = publicFac.map((x) => ({ ...x }));
  return house;
}
