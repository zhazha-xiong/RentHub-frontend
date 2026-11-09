/** 展示格式化：金额用分、时间用 ISO，前端统一在这两个函数里转 */

export function money(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return (cents / 100).toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

export function moneyFixed(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const ORDER_STATUS: Record<string, { text: string; color: string }> = {
  pending: { text: '待商家确认', color: 'warning' },
  confirmed: { text: '已确认', color: 'processing' },
  completed: { text: '已完成', color: 'success' },
  rejected: { text: '已拒绝', color: 'error' },
  cancelled: { text: '已取消', color: 'default' },
}

export const LISTING_STATUS: Record<string, { text: string; color: string }> = {
  online: { text: '在架', color: 'success' },
  offline: { text: '已下架', color: 'default' },
  locked: { text: '已锁定', color: 'warning' },
  rented: { text: '已出租', color: 'processing' },
}

export const QUALIFICATION_STATUS: Record<string, { text: string; color: string }> = {
  not_submitted: { text: '未提交', color: 'default' },
  pending: { text: '待审核', color: 'warning' },
  approved: { text: '已通过', color: 'success' },
  rejected: { text: '已驳回', color: 'error' },
}

export const RENT_TYPE: Record<string, string> = { whole: '整租', shared: '合租' }

/** 2026-11-05 → 明天 */
export function tomorrow(): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
