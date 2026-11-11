# web/ · RentHub 新前端（demo）

按《RentHub 技术文档》的技术选型重建：**Vue 3.5 + Vite 5 + Pinia 2 + Vue Router 4 + TypeScript**，配套**零依赖假后端**与三层自动化测试。

两条基线要分清：

| 维度 | 基线 |
| --- | --- |
| 美术与页面结构 | **沿用 `legacy/v2-static`**：`src/styles/legacy.css` 与 v2 的 `style.css` 字节一致；页面 class 全部是 v2 的 `.topbar/.filters/.masonry/.info/.table/.form` 等 |
| 组件与主题 | Ant Design Vue 4 **只用于**全局主题注入（`a-config-provider`）与 3 个确认弹窗（`a-modal`）；列表、表单、卡片都是 v2 的原生结构 |

## 1. 快速开始

**前置**：Node ≥ 18（CI 用 20），npm 9+。

```bash
cd web
npm ci            # 严格按 package-lock 安装
npm run dev       # http://127.0.0.1:5173 ，Vite 自动拉起假后端（:8787）
```

打开 `http://127.0.0.1:5173/` 即是首页。演示账号（密码都是 `renthub123`）：

| 角色 | 账号 | 登录后落地页 |
| --- | --- | --- |
| 租客 | `xiaofs` | `/` |
| 商家 | `xingchen` | `/merchant/listings` |
| 管理员 | `guanli` | `/admin/qualifications` |
| 商家（资质待审） | `haibin` | 演示资质闸门用 |

## 2. 四种启动方式

```bash
# ① 只跑前端（最常见）：假后端由 vite.config.ts 的插件同进程拉起
npm run dev

# ② 只跑假后端，供 curl / 别的工具用
npm run mock                 # http://127.0.0.1:8787，端口用 PORT 覆盖

# ③ 生产构建 + 预览（E2E 走的就是这条）
npm run build                # vue-tsc --noEmit && vite build → dist/
npm run preview              # http://127.0.0.1:4173 ，同样代理到假后端

# ④ 指向真实后端（接 FastAPI 时）
VITE_API_BASE=https://api.example.com/api/v1 npm run dev
```

> `npm run preview` 与 `dev` 都会自动拉起假后端；**不要**再手动 `node mock/server.mjs`，两个进程抢 8787 会 `EADDRINUSE`。

## 3. 端口与环境变量

| 端口 | 用途 | 可改 |
| --- | --- | --- |
| `5173` | Vite dev server | `vite.config.ts` 的 `server.port` |
| `8787` | 假后端（`/api`、`/mock-files` 都由 Vite 代理到这里） | `MOCK_PORT` 环境变量 |
| `4173` | `vite preview`（E2E 固定用它） | `--port` |

| 环境变量 | 作用 |
| --- | --- |
| `VITE_API_BASE` | 前端请求前缀，默认 `/api/v1`；接真后端改这里 |
| `MOCK_PORT` | 假后端端口，默认 `8787` |
| `MOCK_ACCESS_TTL` | access token 有效期（秒），默认 900，便于测 401 刷新 |
| `MOCK_SSE_DELAY` | SSE 每个事件的延迟，便于观察流式输出 |
| `MOCK_NOW` | 假后端的「当前时间」，默认 `2026-11-05T09:00:00+08:00` |

## 4. 命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器（含假后端、`/api` 与 `/mock-files` 代理） |
| `npm run mock` | 只起假后端 `:8787` |
| `npm run build` | `vue-tsc --noEmit` + `vite build` |
| `npm run preview` | 预览构建产物 `:4173` |
| `npm run typecheck` | 只做类型检查 |
| `npm test` | L1 契约测试（Vitest，不需要浏览器） |
| `npm run test:e2e` | L3 端到端（Playwright，首次需 `npx playwright install chromium`） |

## 5. 目录

```
web/
├─ src/
│  ├─ main.ts / App.vue          入口、antd 主题注入
│  ├─ theme.ts                   设计令牌 → antd token（仅供弹窗与少量控件）
│  ├─ styles/
│  │  ├─ legacy.css              与 v2 style.css 同源（**不要改**）
│  │  └─ global.css              本项目补充：.info-sticky 紧凑化、状态三色、lightbox、骨架
│  ├─ api/                       http.ts（Bearer/401 刷新/错误规范化）、sse.ts、token.ts、index.ts、types.ts
│  ├─ stores/                    auth（会话/计数）、meta（筛选字典）
│  ├─ router/                    16 条路由 + requiresAuth/roles 守卫
│  ├─ layouts/AppLayout.vue      v2 的 .topbar/.sheet/.page/.foot
│  ├─ components/                ListingCard（v2 的 .card）、IconDefs（16 个设施图标）
│  ├─ utils/                     format（金额/时间/状态三色）、facilities、photos
│  └─ views/                     16 个视图
├─ mock/
│  ├─ server.mjs                 假后端（Node 内置 http，43+ 路由）
│  └─ data/seed.mjs              种子数据（12 套房源）
│      photos.mjs                9 张实拍图的宽高与图集（单一真源：legacy/v2-static/assets）
├─ tests/contract.spec.ts        L1 契约测试
├─ e2e/flows.spec.ts             L3 端到端
└─ vite.config.ts / vitest.config.ts / playwright.config.ts / tsconfig.json
```

## 6. 页面与接口

| 路由 | 页面 | 主要接口 |
| --- | --- | --- |
| `/` | 找房列表（一句话搜索、五组筛选、排序、游标分页） | `GET /listings`、`GET /meta/filters` |
| `/listings/:id` | 详情（图集、描述与租约、位置、设施、相关推荐、收藏、下单） | `GET /listings/{id}`、`POST /favorites` |
| `/ai` | AI 找房（SSE 流式、条件回显、候选栏） | `POST /ai/chat` |
| `/login`、`/register` | 登录 / 注册（v2 的 `.auth` 独立布局） | `/auth/*` |
| `/booking/:id` | 确认订单（租期、入住日期、入住人数、联系方式、备注、金额明细） | `POST /orders` |
| `/orders`、`/orders/:id` | 我的订单、订单详情（状态流水、支付、取消） | `/orders*`、`/orders/{id}/pay` |
| `/favorites` | 我的收藏（排序、取消收藏） | `GET/POST /favorites` |
| `/notifications` | 通知中心（类型标签、未读、全部已读、相对时间） | `/notifications*` |
| `/me` | 个人信息与改密 | `GET /auth/me`、`PUT /auth/password` |
| `/merchant/listings` | 商家房源管理（搜索/状态筛选、上下架） | `GET /merchant/listings`、`PATCH /listings/{id}/status` |
| `/merchant/listings/new`、`/:id/edit` | 新建/编辑房源（设施复选、图片上传、**AI 参考价与文案候选**） | `POST/PUT /listings`、`POST /files`、`POST /ai/price-reference`、`POST /ai/copy` |
| `/merchant/orders` | 商家订单（接单/拒单/完成） | `POST /orders/{id}/{confirm,reject,complete}` |
| `/merchant/qualification` | 资质提交与审核记录 | `/merchant/qualification` |
| `/admin/qualifications` | 资质审核（驳回原因 ≥10 字） | `/admin/qualifications*` |
| `/admin/listings` | 房源处置（强制下架） | `GET /admin/listings`、`POST /admin/listings/{id}/offline` |
| `/admin/users` | 用户管理（禁用同步下架） | `/admin/users*` |

## 7. 假后端：怎么「像真的」

| 行为 | 实现 |
| --- | --- |
| 鉴权 | `Bearer` access token（15 分钟，`MOCK_ACCESS_TTL` 可调）+ refresh 一次性轮换 |
| 登录锁定 | 连续 5 次密码错误锁 15 分钟（`423 AUTH_LOCKED`），reset 可解 |
| 错误体 | 固定 `{code, message, details, trace_id}`，`details[]` 带 `{field,message}` |
| 分页 | 游标 base64，`limit` 默认 20 / 上限 50 |
| 房源锁定 | 下单置 `locked`，重复下单与并发下单返回 `409 LISTING_LOCKED` |
| 状态机 | `pending→confirmed→completed`、`pending→rejected`、`pending|confirmed→cancelled`，其它 `409 ORDER_STATE_INVALID` |
| 支付幂等 | 缺 `Idempotency-Key` → 400；同 key 重放返回同一 `trade_no`；同 key 不同订单 → 409 |
| 资质闸门 | 资质非 `approved` 时发布/上架返回 `403 QUALIFICATION_REQUIRED` |
| SSE | `delta → conditions → options/cards → done`，`MOCK_SSE_DELAY` 可加延迟 |
| 参考价 | 四级口径降级 + 样本不足返回 `range: null`（见 `../docs/price-reference.md`），按口径缓存 |
| 图片 | `/mock-files/assets/*.jpg` 直接回放 `legacy/v2-static/assets` 的**真实照片**；上传（`upload/*`）按 key 稳定映射到一张实拍图；只有资质证件走 SVG 占位 |
| 真实比例与文案 | 列表返回 `cover_w/cover_h`（瀑布流用原图比例）、`published_label`（今天上架/3 天前上架）、`stats`（在架与今日新上）、`related`（相关推荐随机 3 套） |
| 相对时间 | 通知返回 `created_label`（10 分钟前 / 今天 09:12）：假后端的「当前时间」固定，前端按浏览器时钟会算错 |
| 一句话搜索 | 先原文匹配；不中则把整句解析成区域/室数/预算/电梯等条件并**分层放宽**；仍不中返回随机推荐并带 `relaxed_note`，不返回空列表 |
| 通知 | 订单动作（下单/接单/拒单/完成/支付）自动写站内通知 |

测试钩子（真后端不实现）：`/__mock__/reset`、`/__mock__/state`、`/__mock__/tick?days=N`、`/__mock__/listings/bulk`，以及 `X-Mock-Fail` / `X-Mock-Delay` 故障注入。

## 8. 美术基线

- 改样式前先看 `src/styles/legacy.css`：它与 `legacy/v2-static/public/style.css` **字节一致**，是 v2 美术的对照基准，**不要修改**。
- 新版需要、v2 没有的样式统一写进 `src/styles/global.css`（`.info-sticky` 紧凑化、状态三色 `.tag.green/.orange/.gray`、lightbox、骨架屏）。
- 校验脚本：`node .probe/style-audit.mjs`（工作区外），会列出「页面用了但没有 v2 样式的 class」。
- 与需求跟踪矩阵（RTM）的差异与取舍：`../docs/rtm-differences.md`。

## 9. 自动化测试与 CI

**约定：本地只跑 `npm run dev` 看页面，所有测试交给 GitHub Actions。**

改动 `web/**` 推到 `main` / `feat/**` / `fix/**`，或开 PR 时触发 `.github/workflows/web-ci.yml`。

| 层 | 内容 | 命令 |
| --- | --- | --- |
| L1 契约 | 29 例：错误体、鉴权与锁定、refresh 轮换、列表筛选/游标、详情字段、收藏、下单金额与锁定、状态机、越权、支付幂等、资质闸门、审核校验、禁用联动、通知已读、SSE 事件序列、参考价降级、tick 自动关单 | `npm test` |
| L2 类型/构建 | `vue-tsc` 严格模式 + `vite build` | `npm run typecheck` / `npm run build` |
| L3 E2E | **只验证渲染与权限守卫，不模拟点击**：业务状态用 API 直接制造，页面侧注入令牌后断言内容；公开页（首页/详情）**也先登录**，以避开「未登录 401 被当登录过期」的已知问题 | `npm run test:e2e` |

CI 的时间都花在哪（实测）：

- **npm 依赖**：`actions/setup-node` 的 `cache: npm` + `npm ci --prefer-offline`（约 5s 安装）
- **浏览器**：**不缓存 Chromium**——安装 21s 里 10.8s 是 apt 系统库（缓存不了），浏览器二进制只 9.2s，而缓存 ~270MB 目录的压缩/还原成本相当。改为用 runner 预装的 Google Chrome（`PW_CHANNEL=chrome`），只装 2MB 的 ffmpeg；没有 chrome 时回退 `npx playwright install --with-deps chromium`
- **构建产物**：L2 `upload-artifact`，L3 `download-artifact` 复用 `web/dist`，不重复构建
- **并发**：同一 ref 的新提交取消上一次运行

失败时上传 `playwright-report` 与 `test-results`（含 trace / 截图 / 视频）作为 artifact。

## 10. 常见问题

| 现象 | 处理 |
| --- | --- |
| `EADDRINUSE :8787` | 已有假后端在跑：`MOCK_PORT=8788 npm run dev`，或先关掉旧进程 |
| `listen EACCES ... :5173` | Windows 的 WinNAT（Hyper-V/WSL2/Docker）把 5173 所在段保留了（常见 `5141–5240`）。换端口：`npm run dev -- --port 5273`；或管理员 `net stop winnat && net start winnat` 释放。查保留段：`netsh interface ipv4 show excludedportrange protocol=tcp`。详见 `../docs/local-dev-troubleshooting.md` |
| `'vite' 不是内部或外部命令` | `node_modules/.bin` 缺失（依赖不是 npm 正常装的），执行 `npm ci` 重装 |
| `spawn EPERM`（构建或测试起不来） | 受限沙箱里 esbuild 无法 spawn 子进程。改用 CI 跑，或换到有完整权限的环境；**不是代码问题** |
| `Executable doesn't exist .../ms-playwright` | 本地没装浏览器：`npx playwright install chromium`。注意不要把 `PLAYWRIGHT_BROWSERS_PATH` 设成 `~/...`——Actions 的 env 不展开 `~` |
| 未登录打开首页却跳到 `/login` | 已知问题：拦截器把所有 401 当"登录过期"（待修）。先用演示账号登录 |
| 房源图片 404 | 假后端从 `legacy/v2-static/assets` 读真实照片；删了 `legacy/` 就没图（会回退 SVG 占位） |
| 通知时间显示成"未来" | 说明前端自己在算时间。展示文案应读后端给的 `created_label` |

> 更细的排查记录与教训见 [`../docs/local-dev-troubleshooting.md`](../docs/local-dev-troubleshooting.md)。

## 11. 已知取舍（demo 范围）

1. 假后端数据在内存里，重启即恢复种子数据；没有持久化。
2. 未实现真实图片上传/OSS、真实支付、真实大模型；AI 用规则式条件抽取 + 检索。
3. 详情页图库的 8 张图来自不同房源（只有 9 张实拍图，不新增房源），肉眼能看出不是同一套。
4. 未实现：`PUT /users/me`（昵称不可改）、图片拖拽排序、AI 生成对比表、商家店铺简介。
5. 本地受限沙箱里 `vite build` / `vitest` / `playwright` 可能起不来（`spawn EPERM`），以 CI 为准。
6. 部分文档未明确的点列在 `../docs/contract-supplements.md`。
