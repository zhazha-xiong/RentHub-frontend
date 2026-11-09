# web/ · RentHub 新前端（demo）

按《RentHub 技术文档》的技术选型重建的前端：**Vue 3.5 + Vite 5 + Pinia 2 + Vue Router 4 + Ant Design Vue 4 + Axios 1.7 + TypeScript**。

当前没有真实后端，所以配套了一个**假后端**（`mock/`）与**中间层**（`src/api/http.ts`），
页面只依赖 `/api/v1` 契约 —— 将来接真 FastAPI 时，改 `VITE_API_BASE` 即可，视图层一行不用动。

## 快速开始

```bash
cd web
npm ci            # 或 npm install
npm run dev       # http://127.0.0.1:5173/ ，Vite 会自动拉起假后端（:8787）
```

演示账号（密码都是 `renthub123`）：

| 角色 | 账号 | 登录后落地页 |
| --- | --- | --- |
| 租客 | `xiaofs` | `/` |
| 商家 | `xingchen` | `/merchant/listings` |
| 管理员 | `guanli` | `/admin/qualifications` |
| 商家（资质待审） | `haibin` | 用于演示资质闸门 |

单独起假后端（供 curl / Playwright 用）：

```bash
node mock/server.mjs          # http://127.0.0.1:8787，端口可用 PORT 覆盖
node mock/server.mjs --help   # 无参数说明，直接看文件头注释
```

## 命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器（含假后端、/api 与 /mock-files 代理） |
| `npm run mock` | 只起假后端 :8787 |
| `npm run build` | `vue-tsc --noEmit` + `vite build` → `dist/` |
| `npm run preview` | 预览构建产物 :4173（同样代理到假后端） |
| `npm run typecheck` | 只做类型检查 |
| `npm test` | L1 契约测试（Vitest，29 例，不需要浏览器） |
| `npm run test:e2e` | L3 端到端（Playwright；首次需 `npx playwright install chromium`） |

## 目录

```
web/
├─ src/
│  ├─ main.ts / App.vue          入口与全局主题
│  ├─ theme.ts                   旧版设计令牌 → antd theme token
│  ├─ api/
│  │  ├─ http.ts                 中间层：axios + Bearer + 401 刷新重放 + 错误规范化
│  │  ├─ token.ts                令牌存取（localStorage）
│  │  ├─ sse.ts                  AI 流式对话（fetch + ReadableStream）
│  │  ├─ index.ts                按业务域的接口门面
│  │  └─ types.ts                与文档第 5 章一一对应的 TS 类型
│  ├─ stores/                    Pinia：auth（会话/计数）、meta（筛选字典）
│  ├─ router/                    路由表 + 守卫（requiresAuth / roles）
│  ├─ layouts/AppLayout.vue      顶栏 + 内容 + 页脚
│  ├─ components/ListingCard.vue
│  └─ views/                     16 个视图（见下）
├─ mock/                         假后端：server.mjs + data/seed.mjs（零依赖）
├─ tests/contract.spec.ts        L1 契约测试
├─ e2e/flows.spec.ts             L3 端到端
└─ vite.config.ts / vitest.config.ts / playwright.config.ts / tsconfig.json
```

## 页面与接口对应

| 路由 | 页面 | 主要接口 |
| --- | --- | --- |
| `/` | 找房列表（筛选/排序/游标分页） | `GET /listings`、`GET /meta/filters` |
| `/listings/:id` | 详情（图集、规格、设施、AI 参考价、收藏、下单） | `GET /listings/{id}`、`POST /ai/price-reference`、`POST /favorites` |
| `/ai` | AI 找房（SSE 流式、条件、选项、卡片） | `POST /ai/chat` |
| `/login`、`/register` | 登录 / 注册（独立布局） | `/auth/*` |
| `/booking/:id` | 确认订单（租期、入住日期、费用明细） | `POST /orders` |
| `/orders`、`/orders/:id` | 我的订单、订单详情（状态流水、支付、取消） | `/orders*`、`/orders/{id}/pay` |
| `/favorites` | 我的收藏 | `GET/POST /favorites` |
| `/notifications` | 通知中心（未读过滤、全部已读） | `/notifications*` |
| `/me` | 个人信息与改密 | `GET /auth/me`、`PUT /auth/password` |
| `/merchant/listings` | 商家房源管理（上下架、编辑） | `GET /merchant/listings`、`PATCH /listings/{id}/status` |
| `/merchant/listings/new`、`/:id/edit` | 新建/编辑房源（含图片上传、AI 文案） | `POST/PUT /listings`、`POST /files`、`POST /ai/copy` |
| `/merchant/orders` | 商家订单（接单/拒单/完成） | `POST /orders/{id}/{confirm,reject,complete}` |
| `/merchant/qualification` | 资质提交与审核记录 | `/merchant/qualification` |
| `/admin/qualifications` | 资质审核（驳回原因 ≥10 字） | `/admin/qualifications*` |
| `/admin/listings` | 房源处置（强制下架） | `GET /admin/listings`、`POST /admin/listings/{id}/offline` |
| `/admin/users` | 用户管理（禁用同步下架） | `/admin/users*` |

## 假后端：怎么「像真的」

| 行为 | 实现 |
| --- | --- |
| 鉴权 | `Bearer` access token（默认 15 分钟，`MOCK_ACCESS_TTL` 可调）+ refresh 一次性轮换 |
| 登录锁定 | 连续 5 次密码错误锁 15 分钟（`423 AUTH_LOCKED`），reset 可解 |
| 错误体 | 固定 `{code, message, details, trace_id}`，`details[]` 带 `{field,message}` |
| 分页 | 游标为 `{id}` 的 base64，`limit` 默认 20 / 上限 50 |
| 房源锁定 | 下单置 `locked`，重复下单与并发下单都返回 `409 LISTING_LOCKED` |
| 状态机 | 只允许 `pending→confirmed→completed`、`pending→rejected`、`pending|confirmed→cancelled`，其它 `409 ORDER_STATE_INVALID` |
| 支付幂等 | 缺 `Idempotency-Key` → 400；同 key 重放返回同一 `trade_no`；同 key 不同订单 → 409 |
| 资质闸门 | 资质非 `approved` 时发布/上架返回 `403 QUALIFICATION_REQUIRED` |
| SSE | `delta → conditions → options/cards → done`，`MOCK_SSE_DELAY` 可加延迟 |
| 参考价 | 四级口径降级 + 样本不足返回 `range: null`（见 `../docs/price-reference.md`），结果按口径缓存（Map 扮演 Redis） |
| 上传 | 校验 multipart、5MB、jpg/png，返回 `object_key` + `/mock-files/...` 占位图 |
| 通知 | 订单动作（下单/接单/拒单/完成/支付）自动写站内通知 |

测试钩子（真后端不实现）：`/__mock__/reset`、`/__mock__/state`、`/__mock__/tick?days=N`、`/__mock__/listings/bulk`，以及 `X-Mock-Fail` / `X-Mock-Delay` 故障注入。

## 自动化测试（由 CI 负责）

**约定的工作方式：本地只跑 `npm run dev` 看页面，所有测试交给 GitHub Actions。**
改动 `web/**` 推到 `main` 或 `feat/**` / `fix/**`、或开 PR 时自动触发 `.github/workflows/web-ci.yml`。

| 层 | 内容 | CI 命令 |
| --- | --- | --- |
| L1 契约 | 29 例：错误体、鉴权与锁定、refresh 轮换、列表筛选/游标、详情字段、收藏、下单金额与锁定、状态机、越权、支付幂等、资质闸门、审核校验、禁用联动、通知已读、SSE 事件序列、参考价降级/样本不足/补样本、tick 自动关单 | `npm test`（Vitest） |
| L2 类型/构建 | `vue-tsc` 严格模式 + `vite build` | `npm run typecheck` / `npm run build` |
| L3 E2E | 租客下单支付、商家接单完成、租客越权被拦、未登录回跳、管理员驳回校验、AI 流式问答 | `npm run test:e2e`（Playwright + chromium） |

CI 的缓存策略（减少每次运行时间）：

- **npm 依赖**：`actions/setup-node` 的 `cache: npm`（按 `web/package-lock.json` 作 key）+ `npm ci --prefer-offline`
- **Playwright 浏览器**：`actions/cache` 缓存 `~/.cache/ms-playwright`，key 跟随 lock 文件（playwright 版本变化自动失效），命中时只跑 `install-deps`
- **构建产物**：L2 阶段 `upload-artifact`，L3 用 `download-artifact` 复用 `web/dist`，不重复构建
- **并发**：同一 ref 的新提交会取消上一次运行（`concurrency.cancel-in-progress`）

失败时上传 `playwright-report` 与 `test-results`（含 trace / 截图）作为 artifact。

> 本地临时排查也可以跑 `npm test` / `npm run test:e2e`，但**不要求**：本地环境（尤其 Windows 沙箱）不一定能起 Chromium。

## 与旧版的关系

- 旧版都在 `../legacy/`（`v1-spa`、`v2-static`），只作美术与交互参照；
  设计令牌（主色 `#0958d9`、圆角 8/4、价格色 `#d4380d`、灰阶文本）已迁到 `src/theme.ts`。
- 旧版是「零构建 + 原生 ESM」，新版按文档改用 Vite + TS + antd 4，因此不再复用旧 CSS。

## 已知取舍（demo 范围）

1. 假后端数据在内存里，重启即恢复种子数据；没有持久化。
2. 未实现真实图片上传/OSS、真实支付、真实大模型；AI 用规则式条件抽取 + 检索。
3. 前端未做按需引入，antd 全量打包（主 chunk 约 1.6 MB，gzip 约 500 KB）；后续可用 `unplugin-vue-components` 按需引入。
4. 部分文档未明确的点（如资料编辑 `PUT /users/me`）未实现，列在 `../docs/contract-supplements.md`。
