# RentHub 技术文档 · 设计评审

评审对象：《RentHub 技术文档》（23 页，HeadlessChrome 从 `word-render` 导出）。
范围：整体架构、技术选型、14 张表 DDL、`/api/v1` 接口契约、后端模块分工。

> 本次只评「会影响前端与联调」的部分；未明确的细节按团队要求搁置，先做可运行的 demo。

## 一、做得好的地方

| 点 | 说明 |
| --- | --- |
| 三层分层 + 跨模块只调 service | `api → services → repositories`，事务边界在 repo、业务规则在 service，职责干净，可测性好 |
| 统一契约 | 错误固定 `code/message/details/trace_id`；列表统一游标分页 `limit/cursor → items/next_cursor`，前端可以只写一套错误处理与分页逻辑 |
| 金额与时间口径 | 金额全部整数分、时间全部 `timestamptz`、删除仅软删除 —— 这三条能避掉线上最常见的金额与时间事故 |
| 订单可审计 | 五态状态机 + `order_status_logs` + `payments`，每次流转与退款都留痕 |
| 约束下沉到库 | `check` 约束覆盖 role / status / rent_type / months 范围，不只靠应用层 |
| AI 契约 | SSE + 结构化事件（`delta/conditions/options/cards/done/error`），降级有独立事件，前端好实现 |
| 幂等 | 支付要求 `Idempotency-Key`，避免重复扣款 |
| 资质闸门 | 作为跨域约束集中在资质模块，房源模块在新建/上架时调用，边界清晰 |

## 二、需要补齐的问题（按严重度）

### 高

1. **JWT 与 Redis 会话二义**：既有 JWT，又说 Redis 存会话；`access_token` 30 分钟并「每次请求刷新空闲计时」没有写实现。建议：access 无状态 + refresh 存 Redis（可吊销、可轮换），滑动过期用 Redis TTL；前端据此做「401 → 静默刷新 → 重放」。
2. **房源锁定并发**：下单把 `listings.status` 置 `locked`，多人同时下单会双锁。需要
   `SELECT ... FOR UPDATE` + **部分唯一索引**（同一房源仅一个 `pending/confirmed` 订单，见 `docs/db-indexes.sql`），以及锁超时释放（配合「超期订单清理」）。
3. **索引缺失**：文档只给 DDL 未给索引。已单独整理为 `docs/db-indexes.sql`（含列表筛选、订单按状态、通知未读、活跃订单唯一约束等）。

### 中

4. `snapshot jsonb` 无版本号：房源字段演进后历史订单渲染会漂移，建议 `snapshot.version` + 前端按版本降级。
5. 上传链路未定：5MB/jpg/png 校验放在网关还是应用层、后端转发 OSS 还是预签名直传，未说明；影响前端上传实现。
6. 缺审计日志：管理员禁用用户、强制下架只有 `reason` 字段，没有统一的 `audit_logs(actor, action, target, payload)`。
7. 缺限流/防刷：目前只有登录失败锁定；AI 接口应单独配额（LLM 成本）。
8. `ai_messages` 没有 token 用量 / 模型 / 耗时：无法做成本控制与 A/B，建议补 `model / tokens_in / tokens_out / latency_ms / cost`。
9. `price_stats` 物化策略与 `relaxed` 规则未定义 —— 已在 `docs/price-reference.md` 给出完整设计与默认行为（含 Redis 存中位数）。
10. 缺 OpenAPI → 前端类型生成的约定：文档说 OpenAPI 自动生成，建议 CI 生成 `types/api.d.ts` 给前端，减少漂移（本次 demo 手写了等价类型）。

### 低

11. `notifications` 无归档/清理策略，表会缓慢膨胀，建议 90 天归档。
12. `price_stats` 只在「夜间」计算，未写任务失败、重入锁、原子切换（建议写临时表后原子替换）。
13. 部署/环境变量/日志与监控章节缺失。
14. 前端页面与交互规格缺失：文档是后端视角，前端页面清单与文案由本次 demo 反推（见 `web/README.md`）。

## 三、对「本次只做 demo」的取舍

- 不实现真实数据库、Redis、OSS、大模型调用；**假后端**用 Node 内置 http + 进程内 Map（扮演 Redis）+ SVG 占位图（扮演 OSS）实现同一份契约。
- 未明确定义的接口（`/auth/refresh`、`/merchant/listings` 等）按常见做法补齐，并在 `docs/contract-supplements.md` 中逐条标注，供真后端对齐。
- 索引与价格参考价这类「后端设计产出」只给方案与 SQL，不在 demo 里落地数据库。
