/**
 * 设施字典：code → 中文名 + 图标 symbol id
 *
 * 与旧版 detail.html 的「卧室设施 / 公共设施」两栏一一对应：
 * 图标 symbol 定义在 components/IconDefs.vue（从 legacy/v1-spa 原样搬过来）。
 */
export interface FacilityMeta {
  label: string
  icon: string
}

export const BEDROOM_FACILITIES: Record<string, FacilityMeta> = {
  tv: { label: '电视', icon: 'i-tv' },
  ac: { label: '空调', icon: 'i-ac' },
  wardrobe: { label: '衣柜', icon: 'i-wardrobe' },
  bed: { label: '床', icon: 'i-bed' },
  bath: { label: '卫生间', icon: 'i-bath' },
  lock: { label: '智能门锁', icon: 'i-lock' },
  balcony: { label: '阳台', icon: 'i-balcony' },
  heater: { label: '暖气', icon: 'i-heater' },
  desk: { label: '书桌', icon: 'i-wardrobe' },
}

export const PUBLIC_FACILITIES: Record<string, FacilityMeta> = {
  fridge: { label: '冰箱', icon: 'i-fridge' },
  washer: { label: '洗衣机', icon: 'i-washer' },
  water: { label: '热水器', icon: 'i-water' },
  wifi: { label: '宽带', icon: 'i-wifi' },
  sofa: { label: '沙发', icon: 'i-sofa' },
  hood: { label: '油烟机', icon: 'i-hood' },
  stove: { label: '燃气灶', icon: 'i-stove' },
  cook: { label: '可做饭', icon: 'i-cook' },
  heating: { label: '暖气', icon: 'i-heater' },
  elevator: { label: '电梯', icon: 'i-balcony' },
  gas: { label: '燃气', icon: 'i-stove' },
  parking: { label: '车位', icon: 'i-sofa' },
}

export function bedroomFacilities(codes: string[] = []): FacilityMeta[] {
  return codes.map((c) => BEDROOM_FACILITIES[c] ?? { label: c, icon: 'i-bed' })
}

export function publicFacilities(codes: string[] = []): FacilityMeta[] {
  return codes.map((c) => PUBLIC_FACILITIES[c] ?? { label: c, icon: 'i-sofa' })
}
