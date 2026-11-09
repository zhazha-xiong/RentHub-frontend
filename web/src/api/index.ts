/**
 * 接口门面：按技术文档第 5 章的业务域分组
 *
 * 视图层只 import 这里的 `api`，不直接碰 axios / fetch。
 */
import { request, upload } from './http'
import type {
  FiltersResp,
  ListingCard,
  ListingDetail,
  ListingQuery,
  ListingWriteReq,
  LoginReq,
  LoginResp,
  MeResp,
  Notice,
  OrderCreateReq,
  OrderDetail,
  Page,
  Payment,
  PriceResp,
  QualificationItem,
  RegisterReq,
  UploadResp,
  User,
} from './types'

/* ---------------- 认证 ---------------- */
export const authApi = {
  register: (body: RegisterReq) => request<LoginResp>({ url: '/auth/register', method: 'POST', data: body }),
  login: (body: LoginReq) => request<LoginResp>({ url: '/auth/login', method: 'POST', data: body }),
  me: () => request<MeResp>({ url: '/auth/me', method: 'GET' }),
  changePassword: (body: { old_password: string; new_password: string }) =>
    request<{ ok: boolean }>({ url: '/auth/password', method: 'PUT', data: body }),
  logout: () => request<void>({ url: '/auth/logout', method: 'POST' }),
}

/* ---------------- 字典 ---------------- */
export const metaApi = {
  filters: () => request<FiltersResp>({ url: '/meta/filters', method: 'GET' }),
  houseTypes: () => request<FiltersResp>({ url: '/meta/filters', method: 'GET' }).then((f) => f.house_types),
}

/* ---------------- 房源 ---------------- */
export const listingApi = {
  list: (query: ListingQuery = {}) => request<Page<ListingCard>>({ url: '/listings', method: 'GET', params: query }),
  detail: (id: number | string) => request<ListingDetail>({ url: `/listings/${id}`, method: 'GET' }),
  create: (body: ListingWriteReq) => request<{ id: number; status: string }>({ url: '/listings', method: 'POST', data: body }),
  update: (id: number | string, body: ListingWriteReq) =>
    request<{ id: number; status: string }>({ url: `/listings/${id}`, method: 'PUT', data: body }),
  setStatus: (id: number | string, status: 'online' | 'offline') =>
    request<{ id: number; status: string }>({ url: `/listings/${id}/status`, method: 'PATCH', data: { status } }),
}

/* ---------------- 收藏 ---------------- */
export const favoriteApi = {
  list: (query: { limit?: number; cursor?: string } = {}) => request<Page<ListingCard>>({ url: '/favorites', method: 'GET', params: query }),
  toggle: (listingId: number, on: boolean) =>
    request<{ listing_id: number; favorited: boolean; count: number }>({
      url: '/favorites',
      method: 'POST',
      data: { listing_id: listingId, on },
    }),
}

/* ---------------- 订单与支付 ---------------- */
export const orderApi = {
  create: (body: OrderCreateReq) => request<OrderDetail>({ url: '/orders', method: 'POST', data: body }),
  list: (query: { tab?: string; limit?: number; cursor?: string } = {}) =>
    request<Page<OrderDetail> & { counts: Record<string, number> }>({ url: '/orders', method: 'GET', params: query }),
  detail: (id: number | string) => request<OrderDetail>({ url: `/orders/${id}`, method: 'GET' }),
  confirm: (id: number | string) => request<OrderDetail>({ url: `/orders/${id}/confirm`, method: 'POST' }),
  reject: (id: number | string, reason: string) => request<OrderDetail>({ url: `/orders/${id}/reject`, method: 'POST', data: { reason } }),
  complete: (id: number | string) => request<OrderDetail>({ url: `/orders/${id}/complete`, method: 'POST' }),
  cancel: (id: number | string, reason?: string) => request<OrderDetail>({ url: `/orders/${id}/cancel`, method: 'POST', data: { reason } }),
  pay: (id: number | string, idempotencyKey: string) =>
    request<Payment>({ url: `/orders/${id}/pay`, method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } }),
  payments: (id: number | string, query: { limit?: number; cursor?: string } = {}) =>
    request<Page<Payment>>({ url: `/orders/${id}/payments`, method: 'GET', params: query }),
}

/* ---------------- 通知 ---------------- */
export const noticeApi = {
  list: (query: { is_read?: boolean; limit?: number; cursor?: string } = {}) =>
    request<Page<Notice> & { unread: number }>({ url: '/notifications', method: 'GET', params: query }),
  read: (id: number) => request<void>({ url: `/notifications/${id}/read`, method: 'POST' }),
  readAll: () => request<void>({ url: '/notifications/read-all', method: 'POST' }),
}

/* ---------------- 管理员 ---------------- */
export const adminApi = {
  qualifications: (status?: string) =>
    request<{ items: QualificationItem[] }>({ url: '/admin/qualifications', method: 'GET', params: status ? { status } : {} }),
  approve: (id: number) => request<{ id: number; status: string }>({ url: `/admin/qualifications/${id}/approve`, method: 'POST' }),
  reject: (id: number, reason: string) =>
    request<{ id: number; status: string }>({ url: `/admin/qualifications/${id}/reject`, method: 'POST', data: { reason } }),
  listings: (query: { keyword?: string; status?: string } = {}) =>
    request<{ items: { id: number; title: string; merchant_name: string; region_name: string; rent: number; status: string; published_at: string | null }[] }>({
      url: '/admin/listings',
      method: 'GET',
      params: query,
    }),
  offline: (id: number, reason: string) => request<{ id: number; status: string }>({ url: `/admin/listings/${id}/offline`, method: 'POST', data: { reason } }),
  users: (query: { keyword?: string } = {}) =>
    request<{ items: (User & { created_at?: string })[] }>({ url: '/admin/users', method: 'GET', params: query }),
  disable: (id: number, reason: string) => request<{ id: number; status: string }>({ url: `/admin/users/${id}/disable`, method: 'POST', data: { reason } }),
  enable: (id: number) => request<{ id: number; status: string }>({ url: `/admin/users/${id}/enable`, method: 'POST' }),
}

/* ---------------- 商家 ---------------- */
export const merchantApi = {
  /* 文档未定义该接口，属契约补充：商家查看自己全部状态的房源 */
  listings: (query: { status?: string; keyword?: string } = {}) =>
    request<{
      items: (ListingCard & { status: string; view_count: number; favorite_count: number; published_at: string | null })[]
      counts: Record<string, number>
    }>({ url: '/merchant/listings', method: 'GET', params: query }),
  summary: () => request<{ listings: number; online: number; pending_orders: number; qualification_status: string }>({
    url: '/merchant/summary',
    method: 'GET',
  }),
  qualification: () =>
    request<{ id?: number; legal_name?: string; status: string; files: { id: number; url: string; file_name?: string }[]; submitted_at?: string | null; reviewed_at?: string | null; reject_reason?: string | null }>({
      url: '/merchant/qualification',
      method: 'GET',
    }),
  saveQualification: (body: { legal_name: string; files: string[] }) =>
    request<{ id: number; status: string }>({ url: '/merchant/qualification', method: 'PUT', data: body }),
}

/* ---------------- AI ---------------- */
export const aiApi = {
  messages: (sessionId: number) =>
    request<{ items: { role: 'user' | 'assistant'; content: string; payload: Record<string, unknown>; created_at: string }[]; context: Record<string, unknown> }>({
      url: `/ai/sessions/${sessionId}/messages`,
      method: 'GET',
    }),
  priceReference: (body: { listing_id?: number; region_code?: string; rooms?: number; area?: number }) =>
    request<PriceResp>({ url: '/ai/price-reference', method: 'POST', data: body }),
  copy: (body: { listing_id: number; field: 'title' | 'description' }) =>
    request<{ candidates: { text: string; valid: boolean }[] }>({ url: '/ai/copy', method: 'POST', data: body }),
}

export { upload }
export type { UploadResp }
