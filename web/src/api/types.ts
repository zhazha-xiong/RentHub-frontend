/**
 * 与《RentHub 技术文档》第 5 章接口一一对应的 TypeScript 类型
 *
 * 命名刻意保持 snake_case 与文档一致：将来由 OpenAPI 自动生成 d.ts 时，
 * 这些类型可以直接被替换，页面组件不需要改。
 */

export type Role = 'tenant' | 'merchant' | 'admin'

export type AccountStatus = 'active' | 'disabled'

export interface User {
  id: number
  account: string
  role: Role
  nickname: string
  phone: string | null
  status: AccountStatus
  qualification_status: string | null
}

export interface RegisterReq {
  account: string
  password: string
  role: 'tenant' | 'merchant'
  nickname?: string
}

export interface LoginReq {
  account: string
  password: string
  role: Role
  remember?: boolean
}

export interface LoginResp {
  access_token: string
  refresh_token: string
  expires_in: number
  user: User
  counts?: Counts
}

export interface Counts {
  favorites: number
  orders: number
  messages: number
}

export interface MeResp extends User {
  initial?: string
  created_at?: string
  counts?: Counts
}

export type Sort = 'composite' | 'latest' | 'price_asc' | 'price_desc'

export interface ListingQuery {
  keyword?: string
  region?: string
  metro_line?: string
  rent_min?: number
  rent_max?: number
  rooms?: string
  rent_type?: 'whole' | 'shared'
  house_type?: string
  orientation?: string
  has_elevator?: boolean
  near_metro?: boolean
  sort?: Sort
  limit?: number
  cursor?: string
}

export interface ListingCard {
  id: number
  title: string
  cover: string
  /** 封面原图宽高：瀑布流据此保持真实比例（旧版是手工写 --ar，现在由后端给） */
  cover_w?: number
  cover_h?: number
  region_name: string
  community: string
  layout: string
  area: number
  floor_desc: string
  /** 朝向/装修的中文名，卡片 meta 直接用（后端字典翻译，前端不做映射） */
  orientation_name?: string
  decoration_name?: string
  rent_type?: 'whole' | 'shared'
  rent: number
  /** 上架时间：卡片左上角「3 天前上架」由它算 */
  published_at?: string | null
  /** 后端算好的上架文案（今天上架 / 3 天前上架），前端直接显示 */
  published_label?: string
  tags: string[]
}

export interface Page<T> {
  items: T[]
  next_cursor: string | null
}

/** 房源列表响应：除分页外还带统计与「一句话搜索」的放宽提示 */
export interface ListingPage extends Page<ListingCard> {
  total?: number
  stats?: { total: number; today_new: number }
  /** 没有精确命中（假后端做了放宽或随机推荐） */
  relaxed?: boolean
  /** 后端给的人话说明，前端直接显示，不自己拼 */
  relaxed_note?: string
}

export interface ListingSpec {
  rooms: number
  halls: number
  baths: number
  floor: number | null
  total_floor: number | null
  orientation: string
  decoration: string
  house_type: string
  rent_type: 'whole' | 'shared'
  available_date: string
  min_lease_months: number
}

export interface MerchantBrief {
  id: number
  name: string
  listing_count: number
  verified: boolean
}

export interface ListingDetail extends ListingCard {
  description: string
  address: string
  metro: { line: string; walk_minutes: number; walk_meters?: number | null } | null
  spec: ListingSpec
  facilities: { bed: string[]; public: string[] }
  images: string[]
  price: { rent: number; deposit: number; service_fee: number; service_fee_rate?: number }
  merchant: MerchantBrief
  status: 'offline' | 'online' | 'locked' | 'rented'
  view_count?: number
  favorite_count?: number
  favorited?: boolean
  /** 相关推荐（给租客看，假后端随机推荐 3 套；v2 detail.html 的同名板块） */
  related?: ListingCard[]
  /** 旧版「房源描述」板块底部的 kv：付款方式 / 看房 / 车位 */
  payment_method?: string | null
  viewing_method?: string | null
  parking?: string | null
  /** 区域编码，用于拉「相关推荐」 */
  region_code?: string
}

export interface ListingWriteReq {
  title: string
  description?: string
  region_code: string
  community?: string
  address: string
  metro_line?: string
  walk_minutes?: number
  rooms: number
  halls?: number
  baths?: number
  area: number
  floor?: number
  total_floor?: number
  orientation?: string
  decoration?: string
  house_type?: string
  rent_type: 'whole' | 'shared'
  has_elevator?: boolean
  facilities?: { bed: string[]; public: string[] }
  rent: number
  deposit: number
  available_date: string
  min_lease_months?: number
  payment_method?: string
  viewing_method?: string
  parking?: string
  images?: string[]
}

export type OrderStatus = 'pending' | 'confirmed' | 'completed' | 'rejected' | 'cancelled'

export interface Order {
  id: number
  order_no: string
  status: OrderStatus
  snapshot: Record<string, unknown>
  rent: number
  months: number
  deposit: number
  service_fee: number
  total_amount: number
  check_in_date: string
  created_at: string
  /** 拒单 / 取消 / 系统自动关闭的原因 */
  reason?: string | null
}

export interface OrderLog {
  from_status: OrderStatus | null
  to_status: OrderStatus
  operator_name: string
  reason: string | null
  created_at: string
}

export interface Payment {
  id: number
  order_id: number
  type: 'pay' | 'refund'
  amount: number
  trade_no: string
  created_at: string
}

export interface OrderDetail extends Order {
  listing_title: string
  cover: string
  logs: OrderLog[]
  payments: Payment[]
  can_confirm: boolean
  can_reject: boolean
  can_complete: boolean
  can_cancel: boolean
  can_pay?: boolean
}

export interface OrderCreateReq {
  listing_id: number
  months: number
  check_in_date: string
  /** v2「确认订单」里的三个选填项，后端存进订单快照 */
  guests?: number
  phone?: string
  note?: string
}

export interface Notice {
  id: number
  type: 'order' | 'listing' | 'system'
  title: string
  body: string
  target_type: 'order' | 'listing' | null
  target_id: number | null
  is_read: boolean
  created_at: string
}

export interface CodeName {
  code: string
  name: string
}

export interface RentBucket {
  min: number
  max: number | null
}

export interface FiltersResp {
  regions: CodeName[]
  metro_lines: CodeName[]
  house_types: CodeName[]
  orientations: CodeName[]
  decorations?: CodeName[]
  rent_buckets: RentBucket[]
  facilities: { bed: CodeName[]; public: CodeName[] }
}

export interface QualificationItem {
  id: number
  merchant_name: string
  legal_name: string
  status: 'not_submitted' | 'pending' | 'approved' | 'rejected'
  files: { id: number; url: string; file_name?: string }[]
  submitted_at: string | null
  reviewed_at: string | null
  reject_reason: string | null
}

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
  payload: Record<string, unknown>
  created_at: string
}

export type ChatEvent =
  | { event: 'delta'; data: { text: string } }
  | { event: 'conditions'; data: Record<string, unknown> }
  | { event: 'options'; data: { group: string; items: { label: string; value: string }[] } }
  | { event: 'cards'; data: { items: ListingCard[] } }
  | { event: 'done'; data: { session_id: number; message_id: number } }
  | { event: 'error'; data: { code: string; message: string } }

export interface PriceResp {
  /** 样本不足时后端返回 null（不给假区间），前端需据此展示「暂无参考价」 */
  range: { min: number; max: number; median: number; p25?: number; p75?: number } | null
  sample_count: number
  relaxed: boolean
  /** 实际采用的口径：region+rooms+area / region+rooms / region / city */
  scope?: string
  scope_label?: string
  insufficient?: boolean
  min_sample?: number
  peers: { title: string; area: number; decoration: string; rent: number }[]
  note: string
}

export interface UploadResp {
  object_key: string
  url: string
  file_name?: string
  size?: number
}

/** 统一错误体（技术文档第 5 章） */
export interface ApiErrorBody {
  code: string
  message: string
  details: unknown
  trace_id: string
}
