# RentHub-frontend

RentHub: A Smart House Rental Platform with AI Agents

前端仓库。当前状态：**新前端（demo）+ 两套旧版留档**。

| 目录 | 内容 | 状态 |
| --- | --- | --- |
| [`web/`](web) | 新前端：Vue 3.5 + Vite 5 + Pinia 2 + Vue Router 4 + Ant Design Vue 4 + Axios 1.7 + TS，配套零依赖**假后端**与三层自动化测试 | ✅ 开发中（demo） |
| [`legacy/v1-spa/`](legacy/v1-spa) | 第一版 SPA 原型（Vue 3 + 原生 ESM、零构建），15 个业务页 | 🗄 只作美术/交互参照 |
| [`legacy/v2-static/`](legacy) | 最早的静态站（15 个 HTML + `scripts/build.mjs` 生成器），无框架 | 🗄 只作美术参照 |
| [`docs/`](docs) | 设计评审、索引方案、参考价与样本不足规则、契约补充说明 | 📄 文档 |

## 一键跑起来

```bash
git clone git@github.com:zhazha-xiong/RentHub-frontend.git
cd RentHub-frontend/web
npm ci
npm run dev            # http://127.0.0.1:5173/ ，自动拉起假后端
```

演示账号（密码都是 `renthub123`）：租客 `xiaofs`、商家 `xingchen`、管理员 `guanli`。

> 旧版仍可单独运行（端口 8788），见 [`legacy/README.md`](legacy/README.md)。

## 为什么有假后端

现在没有真实后端，所以 `web/mock/` 用 Node 内置 http 实现了一份**与技术文档第 5 章一致的契约**：
Bearer 鉴权、统一错误体、游标分页、订单五态状态机、房源锁定、支付幂等键、资质闸门、SSE 流式 AI、
上传校验……前端只依赖 `/api/v1`，将来接真 FastAPI 只需改 `VITE_API_BASE`。

额外提供测试钩子（`/__mock__/reset`、`/__mock__/state`、`/__mock__/tick`、`/__mock__/listings/bulk`），
让自动测试可以断言内部状态、推进时间、注入故障。

## 测试与 CI

**测试全部在 CI 里跑，本地只需要 `npm run dev`。**

| 层 | 内容 |
| --- | --- |
| L1 | 契约测试（29 例，Vitest，无浏览器） |
| L2 | `vue-tsc` 类型检查 + `vite build` |
| L3 | Playwright E2E：主流程 + 三角色越权 |

CI：[`.github/workflows/web-ci.yml`](.github/workflows/web-ci.yml)，改动 `web/**` 时触发；
npm 依赖与 Playwright 浏览器都走 Actions 缓存，L3 复用 L2 的构建产物，失败上传报告 artifact。

## 文档

- [`docs/design-review.md`](docs/design-review.md) —— 对《RentHub 技术文档》的设计评审（含待补项）
- [`docs/db-indexes.sql`](docs/db-indexes.sql) —— 索引与并发约束建议（技术文档只给了 DDL，没给索引）
- [`docs/price-reference.md`](docs/price-reference.md) —— 参考价口径降级、样本不足默认行为、Redis 存中位数
- [`docs/contract-supplements.md`](docs/contract-supplements.md) —— 假后端相对文档多出的接口/字段/错误码
- [`web/README.md`](web/README.md) —— 新前端的运行、目录、页面清单与假后端行为

## 约定

- 提交信息：`feat:` / `fix:` / `docs:` / `style:` / `refactor:` / `test:` / `chore:`
- PR 按 [`.github/pull_request_template.md`](.github/pull_request_template.md) 填写
- 不要提交 `node_modules/`、`dist/`、`runtime/`、`.env`、密钥与大二进制文件（已由 `.gitignore` 覆盖）
