# 旧版前端（美术 / 交互参照，不参与新前端构建）

这些目录**只作参照**，新前端在 [`web/`](../web)。两套旧版都不再维护功能，也不进 CI。

| 目录 | 是什么 | 怎么跑 |
| --- | --- | --- |
| `v1-spa/` | 第一版 SPA 原型（Vue 3 + Vue Router，浏览器原生 ESM，零构建），15 个业务页面 + 零依赖 Node 服务 + 假数据后端 | `node v1-spa/server.mjs` → http://127.0.0.1:8788/ |
| `v2-static/` | 最早的静态站（15 个 HTML，由 `scripts/build.mjs` 生成），纯原生 DOM，无框架 | `node v2-static/server.mjs` → http://127.0.0.1:8788/ |

## 为什么保留

- **美术参照**：`v1-spa/public/style.css` 里的设计令牌（`--primary #0958d9`、`--r-card 8px`、`--price #d4380d`…）
  已被新前端的 antd 主题（`web/src/theme.ts`）继承，改版时对照它看排版气质是否走样。
- **交互参照**：`v2-static/scripts/build.mjs` 是原始页面结构的唯一事实来源，可用于核对字段与文案。
- **回归参照**：必要时可同时起新旧两套（注意端口不同），逐页比对。

## 注意

- `v1-spa/runtime/`、`v2-static/cache/` 是运行产物，已被 `.gitignore` 忽略。
- 两套旧版都自带演示数据（`v1-spa/server/data/`、`v2-static/data/places.json`），不依赖新前端的假后端。
