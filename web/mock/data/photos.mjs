/**
 * 真实房源照片 —— 与旧版 v2 同一批 Wikimedia Commons 图片（单一真源）
 *
 * 为什么不复制一份到 web/public：
 *   照片已经在仓库的 legacy/v2-static/assets 里，且带 credits.json 出处。
 *   假后端在 Node 端按 key 直接读文件返回字节，构建产物里不会多出 4.7MB 重复图片，
 *   版权出处也只有一处需要维护。
 *
 * key 的约定：就是 legacy/v2-static 下的相对路径（例如 `assets/xxx.jpg`）。
 * 前端拿到的是 `/mock-files/assets/xxx.jpg`，由 Vite 代理到假后端。
 * 当 key 指向的文件不存在时（资质证件、用户上传等非实拍图），假后端回退到 SVG 占位图。
 */

/** 9 张实拍图（宽高取自 credits.json，用于瀑布流保持真实比例、避免布局跳动） */
export const PHOTOS = {
  livingModern: { key: 'assets/modern-living-room-with-stylish-furniture-and.jpg', w: 1920, h: 1281, label: '客厅' },
  livingCondominio: { key: 'assets/living-room-in-apartment-of-condominio-do.jpg', w: 1920, h: 1045, label: '客厅' },
  livingNewOrleans: { key: 'assets/new-orleans-french-quarter-apartment-living-room.jpg', w: 1920, h: 1440, label: '客厅' },
  livingHouseplants: { key: 'assets/the-living-room-that-needs-houseplants.jpg', w: 1920, h: 1440, label: '客厅' },
  kitchenBrisbane: { key: 'assets/kitchen-interior-of-apartment-in-brisbane-2025.jpg', w: 1920, h: 1440, label: '厨房' },
  kitchenApartment: { key: 'assets/apartment-kitchen-5170875449.jpg', w: 1920, h: 2560, label: '厨房' },
  bedroomBrisbane: { key: 'assets/bedroom-interior-of-apartment-in-brisbane-2025.jpg', w: 1920, h: 1440, label: '卧室' },
  bedroomBrisbane2: { key: 'assets/bedroom-interior-of-apartment-in-brisbane-2025-2.jpg', w: 1920, h: 1440, label: '卧室' },
  buildingChina: { key: 'assets/apartment-building-in-china.jpg', w: 1920, h: 1440, label: '楼外观' },
}

const P = Object.fromEntries(Object.entries(PHOTOS).map(([k, v]) => [k, v.key]))

/**
 * 每套房源的图集（v2 详情页是「1 张大图 + 4 张缩略图 + 剩余张数」，这里给到 3–8 张）
 * 顺序刻意让封面各不相同，首页瀑布流才像 v2 那样错落有真实内容。
 */
const GALLERY = {
  /* 星海广场：与旧版 detail.html 完全一致的 8 张 */
  101: ['livingModern', 'kitchenBrisbane', 'bedroomBrisbane', 'bedroomBrisbane2', 'livingCondominio',
    'livingHouseplants', 'livingNewOrleans', 'kitchenApartment'],
  102: ['bedroomBrisbane', 'livingModern', 'kitchenBrisbane'],
  103: ['livingCondominio', 'bedroomBrisbane2', 'kitchenApartment', 'livingHouseplants'],
  104: ['bedroomBrisbane2', 'kitchenApartment'],
  105: ['kitchenBrisbane', 'livingModern', 'bedroomBrisbane'],
  106: ['bedroomBrisbane', 'livingHouseplants', 'kitchenBrisbane'],
  107: ['livingHouseplants', 'livingCondominio', 'bedroomBrisbane', 'bedroomBrisbane2', 'kitchenBrisbane'],
  108: ['livingNewOrleans', 'bedroomBrisbane', 'kitchenApartment'],
  109: ['kitchenApartment', 'livingNewOrleans'],
  110: ['buildingChina', 'livingCondominio', 'kitchenBrisbane', 'bedroomBrisbane2'],
  111: ['kitchenBrisbane', 'livingModern', 'bedroomBrisbane'],
  112: ['bedroomBrisbane2', 'livingHouseplants', 'kitchenApartment', 'livingCondominio'],
}

/** 新建房源（商家端上传前）的默认图集：按 id 轮换，保证不会出现空图 */
const FALLBACK = ['livingModern', 'bedroomBrisbane', 'kitchenBrisbane', 'livingCondominio', 'livingHouseplants']

/** 某个房源的图集 → seed 里 images 字段的结构 */
export function galleryFor(id, extra = 0) {
  const names = GALLERY[id] ?? FALLBACK
  const set = extra > 0 ? [...names, ...FALLBACK.slice(0, extra)] : names
  return set.map((name, i) => ({ key: P[name], sort: i, isCover: i === 0 }))
}

/** 单张照片的宽高（假后端据此返回 cover_w / cover_h，前端用来保持真实比例） */
export function photoSize(key) {
  const hit = Object.values(PHOTOS).find((p) => p.key === key)
  return hit ? { w: hit.w, h: hit.h } : null
}

/**
 * 演示上传：假后端不落盘字节，但也不该让商家看到的是一块渐变色块——
 * 按 object key 稳定挑一张真实照片回放（同一个 key 永远同一张，刷新不变）。
 */
export function photoKeyFor(seedStr) {
  const keys = Object.values(PHOTOS).map((p) => p.key)
  let h = 17
  for (const ch of String(seedStr)) h = (h * 31 + ch.charCodeAt(0)) % 99991
  return keys[h % keys.length]
}

/** object key → legacy/v2-static 下的绝对相对路径（假后端读文件用） */
export function assetPath(key) {
  return String(key).startsWith('assets/') ? String(key) : null
}
