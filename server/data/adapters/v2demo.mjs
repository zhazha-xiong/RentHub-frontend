/**
 * 适配器 A：v2 演示数据源
 *
 * v2 的那 9 条房源原本写死在 scripts/build.mjs 的 L 数组里。这里把它当作
 * 一个「后端数据源」，只负责把来源字段映射成 schema 的规范字段，其余交给
 * normalizeHouse() 补全 —— 这就是兼容器分层：换数据源只改这个文件。
 *
 * 坐标：v2 数据本身没有经纬度，由 catalog 注入的 geo 字典（places.json 按区
 * 计算出的坐标锚点）解析，保证每次启动结果稳定。
 */

const A = '/assets/';
const IMG = {
  l1: A + 'modern-living-room-with-stylish-furniture-and.jpg',
  l2: A + 'living-room-in-apartment-of-condominio-do.jpg',
  l3: A + 'the-living-room-that-needs-houseplants.jpg',
  l4: A + 'new-orleans-french-quarter-apartment-living-room.jpg',
  b1: A + 'bedroom-interior-of-apartment-in-brisbane-2025.jpg',
  b2: A + 'bedroom-interior-of-apartment-in-brisbane-2025-2.jpg',
  k1: A + 'kitchen-interior-of-apartment-in-brisbane-2025.jpg',
  k2: A + 'apartment-kitchen-5170875449.jpg',
  bd: A + 'apartment-building-in-china.jpg',
};

const DESC_DEFAULT = (h) =>
  `房子在${h.area}附近，步行到地铁 ${h.metroLine} 约 ${h.metroWalk} 米。${h.orient === '南北' ? '南北通透，' : ''}` +
  `主卧采光好，客厅带阳台。房东自住装修，家电齐全，可拎包入住。楼下有便利店与菜市场，小区 24 小时门禁。`;

/** 商家：星辰公寓（m-001，商家端登录账号）、海滨小屋（m-002） */
const MERCHANTS = {
  'm-001': { id: 'm-001', name: '星辰公寓', verified: true, responseText: '资质已认证 · 平均响应 1 小时' },
  'm-002': { id: 'm-002', name: '海滨小屋', verified: true, responseText: '资质已认证 · 平均响应 3 小时' },
};

/** 9 条演示房源（顺序 = v2 瀑布流顺序） */
const RAW = [
  { id: 'h-001', img: IMG.l1, ar: '16/9', t: '星海广场 · 2室1厅', district: '沙河口', area: '星海广场', rooms: 2, halls: 1, baths: 1, areaSize: 86, orient: '南北', floor: 14, totalFloor: 26, decor: '精装', type: '普通住宅', rentType: '整租', price: 3200, tags: ['近地铁', '有电梯'], when: '3 天前', metro: { line: '1 号线', walkM: 320 }, address: '大连市沙河口区星海广场东路 6 号 3 单元 1402', views: 188, fav: 12, status: '在架', merchant: 'm-001', elev: true, avail: '2026-12-01' },
  { id: 'h-002', img: IMG.b1, ar: '2/3', t: '和平广场 · 1室1厅', district: '沙河口', area: '和平广场', rooms: 1, halls: 1, baths: 1, areaSize: 52, orient: '朝南', floor: 6, totalFloor: 18, decor: '简装', type: '普通住宅', rentType: '整租', price: 1850, tags: ['有电梯'], when: '5 天前', metro: { line: '2 号线', walkM: 540 }, address: '大连市沙河口区和平广场 12 号 2 单元 602', views: 96, fav: 5, status: '在架', merchant: 'm-001', elev: true, avail: '2026-11-20' },
  { id: 'h-003', img: IMG.l2, ar: '1/1', t: '软件园 · 2室2厅', district: '高新园区', area: '软件园', rooms: 2, halls: 2, baths: 1, areaSize: 98, orient: '东南', floor: 9, totalFloor: 32, decor: '精装', type: '普通住宅', rentType: '整租', price: 4100, tags: ['近地铁', '有电梯'], when: '今天', metro: { line: '1 号线', walkM: 410 }, address: '大连市高新园区软件园东路 8 号 1 单元 903', views: 231, fav: 18, status: '已出租', merchant: 'm-001', elev: true, avail: '2026-11-20' },
  { id: 'h-004', img: IMG.b2, ar: '3/4', t: '青泥洼桥 · 单间', district: '中山', area: '青泥洼桥', rooms: 1, halls: 0, baths: 1, areaSize: 38, orient: '朝东', floor: 4, totalFloor: 7, decor: '简装', type: '普通住宅', rentType: '合租/单间', price: 1200, tags: ['近地铁', '合租'], when: '昨天', metro: { line: '2 号线', walkM: 260 }, address: '大连市中山区青泥洼桥街 18 号 3 单元 401', views: 74, fav: 3, status: '在架', merchant: 'm-002', elev: false, avail: '2026-11-15' },
  { id: 'h-005', img: IMG.l3, ar: '3/2', t: '人民广场 · 3室2厅', district: '西岗', area: '人民广场', rooms: 3, halls: 2, baths: 2, areaSize: 128, orient: '南北', floor: 3, totalFloor: 6, decor: '豪装', type: '普通住宅', rentType: '整租', price: 5600, tags: ['有电梯'], when: '8 天前', metro: { line: '1 号线', walkM: 760 }, address: '大连市西岗区人民广场西路 3 号 1 单元 302', views: 45, fav: 2, status: '已下架', merchant: 'm-001', elev: true, avail: '2026-12-10' },
  { id: 'h-006', img: IMG.k1, ar: '4/3', t: '西安路 · 2室1厅', district: '沙河口', area: '西安路', rooms: 2, halls: 1, baths: 1, areaSize: 78, orient: '朝南', floor: 12, totalFloor: 24, decor: '精装', type: '普通住宅', rentType: '整租', price: 2650, tags: ['近地铁', '有电梯'], when: '今天', metro: { line: '1 号线', walkM: 480 }, address: '大连市沙河口区西安路 6 号 2 单元 1202', views: 142, fav: 9, status: '在架', merchant: 'm-001', elev: true, avail: '2026-11-25' },
  { id: 'h-007', img: IMG.k2, ar: '3/2', t: '光明街 · 2室1厅', district: '金州', area: '光明街', rooms: 2, halls: 1, baths: 1, areaSize: 90, orient: '东西', floor: 2, totalFloor: 6, decor: '简装', type: '普通住宅', rentType: '整租', price: 1900, tags: [], when: '12 天前', metro: { line: '3 号线', walkM: 1100 }, address: '大连市金州区光明街道 21 号 1 单元 202', views: 61, fav: 1, status: '在架', merchant: 'm-002', elev: false, avail: '2026-12-01' },
  { id: 'h-008', img: IMG.l4, ar: '1/1', t: '华南广场 · 1室1厅', district: '甘井子', area: '华南广场', rooms: 1, halls: 1, baths: 1, areaSize: 45, orient: '朝北', floor: 5, totalFloor: 18, decor: '精装', type: '公寓', rentType: '整租', price: 1550, tags: ['有电梯'], when: '2 天前', metro: { line: '5 号线', walkM: 350 }, address: '大连市甘井子区华南广场 9 号 2 单元 505', views: 88, fav: 4, status: '在架', merchant: 'm-002', elev: true, avail: '2026-11-18' },
  { id: 'h-009', img: IMG.bd, ar: '2/3', t: '旅顺口 · 2室1厅', district: '旅顺口', area: '旅顺口', rooms: 2, halls: 1, baths: 1, areaSize: 82, orient: '朝南', floor: 8, totalFloor: 11, decor: '简装', type: '普通住宅', rentType: '整租', price: 1600, tags: [], when: '6 天前', metro: { line: '12 号线', walkM: 950 }, address: '大连市旅顺口区长江路 66 号 3 单元 801', views: 52, fav: 2, status: '在架', merchant: 'm-002', elev: true, avail: '2026-12-05' },
];

/** 详情页用到的照片墙（第一张是封面，其余为室内） */
const GALLERY = {
  'h-001': [IMG.l1, IMG.k1, IMG.b1, IMG.b2, IMG.l2, IMG.l3, IMG.k2, IMG.bd],
  'h-002': [IMG.b1, IMG.l4, IMG.l2],
  'h-003': [IMG.l2, IMG.k1, IMG.l1],
  'h-004': [IMG.b2, IMG.k2],
  'h-005': [IMG.l3, IMG.l1, IMG.l4],
  'h-006': [IMG.k1, IMG.l1, IMG.b1],
  'h-007': [IMG.k2, IMG.l3],
  'h-008': [IMG.l4, IMG.k1],
  'h-009': [IMG.bd, IMG.l2],
};

/** 每条房源的 tag 装饰（详情页除了卡片标签，还多两个：新上/看房） */
const DETAIL_TAGS = {
  'h-001': [{ text: '3 天内新上', kind: 'hue' }, { text: '随时看房', kind: 'plain' }],
  'h-003': [{ text: '今天新上', kind: 'hue' }, { text: '随时看房', kind: 'plain' }],
  'h-006': [{ text: '今天新上', kind: 'hue' }, { text: '预约看房', kind: 'plain' }],
};

export function load() {
  return RAW.map((h) => {
    const gallery = GALLERY[h.id] || [h.img];
    const detailTags = (DETAIL_TAGS[h.id] || [{ text: '随时看房', kind: 'plain' }]);
    return {
      /* ---- 映射成 schema 规范字段（来源字段名 → 契约字段名） ---- */
      id: h.id,
      code: 'RH',
      title: h.t,
      images: gallery.map((src, i) => ({ src, alt: i === 0 ? '房源室内实拍，教学演示图片' : '', ar: i === 0 ? h.ar : '4/3' })),
      description: {
        text: h.id === 'h-001'
          ? '房子在星海广场东侧，步行到地铁 1 号线约 320 米。南北通透，主卧朝南，客厅带 3.6 米宽阳台。房东自住装修，家电齐全，可拎包入住。楼下有便利店与菜市场，小区 24 小时门禁。'
          : DESC_DEFAULT({ area: h.area, orient: h.orient, metroLine: h.metro.line.replace(' ', ''), metroWalk: h.metro.walkM }),
        kv: [
          { k: '付款方式', v: '押一付三' },
          { k: '最短租期', v: '6 个月' },
          { k: '看房', v: '随时可看' },
          { k: '车位', v: '小区地下车库，另计' },
        ],
      },
      tags: [...h.tags.map((t) => ({ text: t, kind: 'blue' })), { text: h.decor, kind: 'blue' }, ...detailTags],
      coord: h.coord || null,                     // 由 catalog 用 places.json 锚点解析
      place: {
        city: '大连',
        district: h.district,
        area: h.area,
        address: h.address,
        metro: { line: h.metro.line, walkM: h.metro.walkM },
      },
      spec: {
        rooms: h.rooms, halls: h.halls, baths: h.baths,
        area: h.areaSize, floor: h.floor, totalFloor: h.totalFloor,
        orient: h.orient, decor: h.decor, type: h.type, rentType: h.rentType, elevator: h.elev,
      },
      pricing: { rent: h.price, deposit: h.price, serviceFee: Math.round(h.price * 0.05), payMethod: '押一付三' },
      availability: { availableFrom: h.avail, minMonths: 6, viewing: '随时可看', parking: '小区地下车库，另计' },
      facilities: {},
      merchant: MERCHANTS[h.merchant],
      listing: { status: h.status, updatedLabel: h.when, views: h.views, favCount: h.fav },
      listing_ratio: h.ar,
      source: { provider: 'v2-demo', ref: h.id },
    };
  });
}

export const meta = { provider: 'v2-demo', title: 'v2 演示房源（9 条）' };
