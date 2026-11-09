# 契约补充：假后端相对技术文档多出来的部分

技术文档第 5 章没定义、但前端必须有或测试必须用的接口与字段。**真后端实现时请逐条对齐**；
除此之外，前端只依赖文档里已有的契约。

## 1. 接口

| 接口 | 为什么需要 | 假后端行为 | 真后端建议 |
| --- | --- | --- | --- |
| `POST /api/v1/auth/refresh` | 文档给了 `refresh_token` 与 `expires_in`，但没给刷新端点；access 只有 30 分钟，没有它前端只能到点掉登录 | 校验 refresh（一次性），返回新的 access + refresh；已用过的 refresh 再提交返回 401 `AUTH_REFRESH_REUSED` | 按同样语义实现，refresh 存 Redis 并轮换 |
| `GET /api/v1/merchant/listings` | `/listings` 是公开列表（只有在架），商家需要看到自己**全部状态**（含下架/锁定/已出租） | 返回自己名下房源 + 各状态计数 | 建议按 `merchant_id` 限制，支持 `status` / `keyword` |
| `GET /api/v1/merchant/summary` | 顶栏与工作台需要「在架数 / 待接单数 / 资质状态」 | 返回聚合计数 | 可并入 `/merchant/overview`，字段保持 |
| `GET /api/v1/merchant/qualification` / `PUT` 同路径 | 文档只有管理员的审核接口，商家侧没有「查/提交自己的资质」 | 返回/提交主体名称与材料对象键 | 建议 PUT 支持幂等（重复提交视为更新并回到 pending） |
| `POST /api/v1/favorites` | 文档只有 `GET /api/v1/favorites`（收藏列表），没有「加/取消收藏」 | body `{listing_id, on}`，返回 `{favorited, count}` | 也可拆成 POST/DELETE `/favorites/{listing_id}`，语义保持一致 |
| `GET /api/v1/admin/users` · `POST /admin/users/{id}/disable|enable` | 文档写了禁用/启用接口，但没有用户列表接口（管理端无法选人） | 返回非管理员账号列表，支持 keyword | 建议补 `GET /admin/users`，禁用时同步下架房源 |
| `GET /api/v1/admin/listings` | 同上：文档有强制下架接口，没有列表 | 返回全量房源（含状态），支持 keyword/status | — |

## 2. 字段补充

| 位置 | 字段 | 含义 |
| --- | --- | --- |
| `POST /ai/price-reference` 响应 | `scope` | 实际采用口径：`region+rooms+area` / `region+rooms` / `region` / `city` |
| 同上 | `scope_label` | 口径中文名，直接给前端展示 |
| 同上 | `insufficient` | 样本不足（此时 `range` 为 `null`，见 `docs/price-reference.md`） |
| 同上 | `min_sample` | 当前生效的样本阈值 |
| `range` | 可为 `null` | 文档类型写成对象，实际需要允许 null 表达「样本不足」 |
| `GET /listings` 响应 | `total` | 命中总数（前端展示「共 N 套」）；游标分页下这是额外聚合，可选用 |
| `GET /orders` 响应 | `counts` | 各状态计数，用于页签角标（否则要发 6 次列表请求） |
| `GET /notifications` 响应 | `unread` | 未读数 |
| `GET /auth/me` 响应 | `counts` / `initial` | 顶栏红点与头像首字 |
| `OrderDetail` | `can_pay` | 是否可支付（文档只给了 confirm/reject/complete/cancel 四个 can_*） |
| `Order` | `reason` | 拒单/取消/系统自动关闭的原因 |
| `ListingDetail` | `favorited` / `view_count` / `favorite_count` | 详情页展示与收藏按钮状态 |

## 3. 错误码

文档只点了 `AUTH_ROLE_MISMATCH` 一个。假后端用到的完整集合（前端已按这些做文案映射，
新增时请同步 `web/src/views/LoginView.vue` 的 `ERROR_TEXT`）：

| code | HTTP | 场景 |
| --- | --- | --- |
| `VALIDATION_FAILED` | 422 | 参数校验失败，`details[]` 带 `{field, message}` |
| `NOT_FOUND` | 404 | 资源不存在 |
| `CONFLICT` | 409 | 状态冲突（如资质已审核过） |
| `AUTH_INVALID_CREDENTIALS` | 401 | 账号或密码错误 |
| `AUTH_ROLE_MISMATCH` | 403 | 登录入口与账号角色不符 |
| `AUTH_LOCKED` | 423 | 连续 5 次失败锁定 15 分钟 |
| `AUTH_ACCOUNT_DISABLED` | 403 | 账号被禁用 |
| `AUTH_ACCOUNT_TAKEN` | 409 | 注册账号已存在 |
| `AUTH_TOKEN_MISSING` / `AUTH_TOKEN_INVALID` / `AUTH_TOKEN_EXPIRED` | 401 | 令牌缺失/非法/过期 |
| `AUTH_REFRESH_REUSED` | 401 | 刷新令牌被重复使用（轮换机制） |
| `ROLE_FORBIDDEN` | 403 | 角色无权 |
| `QUALIFICATION_REQUIRED` | 403 | 资质未通过，不能发布/上架 |
| `LISTING_LOCKED` | 409 | 房源已锁定/被其他订单占用 |
| `LISTING_STATE_INVALID` | 409 | 房源状态不允许该操作 |
| `ORDER_STATE_INVALID` | 409 | 订单状态机不允许该流转 |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | 支付缺 `Idempotency-Key` |
| `IDEMPOTENCY_CONFLICT` | 409 | 同一 key 用于不同订单 |
| `FILE_TOO_LARGE` / `FILE_TYPE_INVALID` | 413 / 422 | 上传超 5MB / 非 jpg、png |

## 4. 测试专用钩子（真后端不要实现）

| 钩子 | 用途 |
| --- | --- |
| `POST /__mock__/reset` | 重置种子数据（每个测试用例前调用） |
| `GET /__mock__/state` | 读内部状态，断言「房源已锁定 / 已产生流水」 |
| `POST /__mock__/tick?days=N` | 推进假时钟，触发超期订单自动关闭 |
| `POST /__mock__/listings/bulk` | 批量造在架样本，验证价格统计从 `insufficient` 变正常 |
| `X-Mock-Fail: db-down` / `X-Mock-Delay: 800` | 故障与慢网络注入，测前端降级 |
