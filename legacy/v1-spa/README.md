# 栖居 RentHub · 前端（第一版原型 / v1 prototype）

RentHub: A Smart House Rental Platform with AI Agents

> **第一版原型（v1）**：用于演示与评审的可用原型，完整跑通「找房 → 详情 → 下单 → 商家接单 → 管理员审核」主流程，
> 租客 / 商家 / 管理员三个角色端齐备。数据为教学演示数据（`server/data/`），支付为模拟，
> 地图与图片上传只保留接口能力、未接 UI。界面沿用旧版静态工程的设计令牌与排版，作为后续迭代的基线版本。

把旧工程 `frontend/`（15 个静态 HTML 页）重写成 **Vue 3 + Vue Router** 的 SPA：
页面排版、class 结构、`style.css` **一个字都没改**，换掉的只是「数据来源」和「页面跳转方式」。

- 前端：浏览器原生 ES Module，Vue / Vue Router 用 `vendor/` 里的官方全局构建（含模板编译器）
- 服务端：零依赖 Node HTTP 服务，同时负责静态托管、SPA fallback 和 `/api/*`（鉴权 + 业务 + 持久化）
- **不需要 `npm install`，不需要打包工具**：改完文件刷新即生效

---

## 第一版原型的范围

| 状态 | 内容 |
| --- | --- |
| ✅ 已实现 | 15 个业务页面的 SPA 化（找房/详情/AI 找房/下单/收藏/订单/通知/个人信息/登录注册/商家 4 页/管理员审核）、三个角色端、路由守卫 + 服务端角色校验、订单与收藏与消息的后端持久化、表单草稿、URL 状态保持、浏览位置恢复 |
| ✅ 已实现 | 数据兼容器（适配器 → 统一模型 → 筛选排序分页），换数据源前端零改动 |
| ⬜ 本期未接 | 真实支付（点击模拟支付直接生成订单）、地图渲染（`/api/map/*` 代理与坐标已就绪）、图片上传（沿用 `assets/` 演示图）、真实数据库（用 `runtime/store.json` 落盘） |
| ⬜ 未迁移 | 旧版 `public/style-lab.html`（设计令牌实验页） |

---

## 快速开始

### 环境要求

| 项 | 要求 |
| --- | --- |
| Node.js | **≥ 18**（用到内置 `fetch`、`node:` 前缀模块；开发验证在 v26 上通过） |
| npm | 可选，仅用于 `npm start` 这类脚本别名 |
| 浏览器 | 支持 ES Module 的现代浏览器（Chrome / Edge / Firefox / Safari 近期版本） |
| 依赖安装 | **不需要**（运行时全部在仓库内 `vendor/`，见下文「依赖清单」） |

### 运行

```bash
# 1. 进入项目目录
cd RentHub-frontend

# 2. 启动（任选一种，效果相同）
npm start            # 或 npm run dev
node server.mjs

# 3. 浏览器打开
#    http://127.0.0.1:8788/
```

启动成功会打印：

```
  栖居 RentHub（Vue 3 + Vue Router）已启动
  地址：   http://127.0.0.1:8788/
  数据源： v2-demo（v2 演示数据）· 房源 9 条 / 在架 9 条
```

### 自检 / 换端口 / 换数据源

```bash
npm run check                          # 对服务端所有 .mjs 做语法检查

PORT=8080 node server.mjs              # Windows PowerShell：$env:PORT=8080; node server.mjs
HOST=0.0.0.0 node server.mjs           # 允许局域网访问

# 换成 175 条大连 POI 当房源列表（前端一行都不用改）
CATALOG_SOURCE=places node server.mjs  # PowerShell：$env:CATALOG_SOURCE='places'; node server.mjs
```

### 演示账号（密码都是 `renthub123`）

| 入口 | 账号 | 登录后落地页 |
| --- | --- | --- |
| 租客 | `xiaofs` | `/` |
| 商家 | `xingchen` | `/merchant/listings` |
| 管理员 | `guanli` | `/admin/review` |

登录页底部「原型演示：密码错误 · 入口不符 · 账号锁定」三个链接仍可点，提示文案与旧版一致；
其中「账号锁定」不是假文案 —— 连续 5 次密码错误会真的锁 15 分钟。

---

## 依赖清单与项目通用文件

### 前端项目通用文件（仓库根）

| 文件 | 作用 |
| --- | --- |
| `package.json` | 标准前端工程描述：`name` / `version` / `type: module` / `engines` / `scripts` / `dependencies` |
| `.gitignore` | 通用忽略清单：`node_modules/`、构建产物、日志、`runtime/`、`cache/`、`.env*`、编辑器目录 |
| `.gitattributes` | 换行统一为 LF，图片按二进制处理，`vendor/` 标记为第三方 |
| `.editorconfig` | 统一 UTF-8 / LF / 2 空格缩进 |
| `README.md` | 本文档：运行方式、目录、接口、环境变量、排错 |
| `.github/pull_request_template.md` | 团队 PR 模板 |

### 运行依赖（`package.json` → `dependencies`）

| 包 | 版本 | 说明 |
| --- | --- | --- |
| `vue` | `3.5.41` | 使用 `vendor/vue.global.prod.js`（**完整版，含模板编译器**，组件用 `template` 字符串编写） |
| `vue-router` | `4.6.4` | 使用 `vendor/vue-router.global.prod.js`（History 模式） |

两者以浏览器全局构建形式随仓库提供，`npm install` 装来的 `node_modules` 不参与运行；
声明在 `dependencies` 里是为了锁定版本、便于将来接 `vite` 等打包工具时无缝迁移。

### `vendor/` 内置第三方运行时（浏览器直接可用）

| 文件 | 版本 | 当前是否使用 |
| --- | --- | --- |
| `vendor/vue.global.prod.js` | 3.5.41 | ✅ 使用 |
| `vendor/vue-router.global.prod.js` | 4.6.4 | ✅ 使用 |
| `vendor/antd/antd.min.js` + `reset.css` | ant-design-vue 4.2.6（UMD） | ⬜ 预留，未引用 |
| `vendor/dayjs/dayjs.min.js` + `plugin/*` | 1.11.23（7 个插件） | ⬜ 预留，未引用 |

> 服务端不依赖任何 npm 包，只用 Node 内置模块（`node:http` / `node:fs` / `node:crypto` / `node:path` / `node:url`）。

### 目录

```
frontend-vue/
├─ package.json / .gitignore / .gitattributes / .editorconfig / README.md
├─ server.mjs                  HTTP 服务：静态托管 + SPA fallback + /api 分发
├─ server/
│  ├─ api.mjs                  全部 REST 接口（鉴权 + 业务）
│  ├─ store.mjs                runtime/store.json 持久化（原子写、防抖落盘）
│  ├─ session.mjs              httpOnly cookie 会话 + 登录失败锁定
│  ├─ amap.mjs                 高德代理（能力保留，本期不渲染地图）
│  └─ data/
│     ├─ schema.mjs            统一房源模型 + normalizeHouse() 兼容归一化
│     ├─ catalog.mjs           数据源装配、坐标解析、筛选/排序/分页
│     └─ adapters/
│        ├─ v2demo.mjs         旧版 9 条演示房源（默认数据源）
│        └─ places.mjs         places.json 的 175 条大连 POI（备用数据源 + 坐标字典）
├─ public/                     浏览器根
│  ├─ index.html               SPA 外壳（唯一 HTML）
│  ├─ style.css                ★ 与旧版逐字节一致，不要改
│  ├─ config.js                高德前端配置（本期未使用）
│  └─ js/
│     ├─ main.js  lib.js  api.js  store.js  router.js  App.js  ui.css
│     ├─ components/           AppShell / AuthLayout / HouseCard / IconDefs / ToastHost
│     └─ views/                Home / Detail / Agent / Booking / Orders / Favorites /
│                              Messages / Profile / Login / Register / NotFound
│                              merchant/{Listings,Edit,Orders,Profile}  admin/Review
├─ assets/                     9 张实拍图 + credits.json
├─ vendor/                     Vue / Vue Router（+ antd、dayjs 预留）
├─ data/places.json            175 条 GCJ-02 坐标
├─ runtime/store.json          运行状态（收藏/订单/消息/草稿/会话），首次启动生成，已被 git 忽略
└─ config.server.json          高德 Web 服务 Key（仅后端读取）
```

---

## 要求对照

| 要求 | 落地方式 |
| --- | --- |
| 保留旧版美术风格、排版一点不改 | `public/style.css` 与旧版**逐字节一致**（SHA256 相同）；各页面 DOM 结构与 class 与 `scripts/build.mjs` 生成的 HTML 一一对应 |
| 组装成前端项目，node 启动 | `node server.mjs`，零依赖、无构建步骤 |
| Vue 3 + Vue Router 路由，减少非法用户通过链接访问 | History 模式 + 全局守卫（`public/js/router.js`）+ **服务端 session 角色校验**（`server/session.mjs`） |
| 后端数据结构不确定 → 先做兼容器 | `server/data/schema.mjs` 统一模型 + `server/data/adapters/*` 适配器 |
| 房源抽象出编号/图片/描述/tag/坐标/地点 | 统一 House 模型，见 `server/data/schema.mjs` 顶部注释 |
| 数据挪到后端 | 页面里没有任何写死的房源/订单/消息数据，全部 `/api/*` |
| 收藏、订单、房源、瀑布流、消息、刷新不丢状态 | 每条都是稳定 URL；筛选/分页/页签状态写在 URL query；浏览位置存 sessionStorage；填写内容存后端草稿 |
| 登录、商家端、管理员端单独 URL | `/login`、`/merchant/*`、`/admin/*` |

## 数据兼容器（后端结构不确定时的做法）

三层，换真实后端只动中间那层：

```
适配器 adapters/*.mjs   →  统一模型 schema.normalizeHouse()  →  catalog.query()  →  /api  →  前端
（任意字段名）              （固定形状 + 缺省补全）              （筛选/排序/分页）
```

`normalizeHouse()` 能吃下这些「不确定」的写法：

- 主键：`id` / `houseId` / `code` / `no`
- 图片：`images` / `pics` / `photos` / 单张 `cover`，字符串或对象都行
- 坐标：`{lon,lat}` / `[lon,lat]` / `"121.6,38.9"` / `longitude+latitude` / 平铺字段
- 户型：`2 室 1 厅 1 卫` / `2/1/1` / 分开的 `rooms/halls/baths`
- 楼层：`14/26` / `14 / 26 层` / 两个数字
- 租金：`rent` / `price` / `monthlyRent`
- 标签：`string[]` 或 `{text,kind}[]`

坐标：旧数据本身没有经纬度，`catalog.mjs` 用 `places.json` 按行政区算质心锚点 + 确定性偏移补全，
**每次启动结果都一样**；能在 POI 里按小区名匹配到就用真实坐标。所有坐标统一为高德 GCJ-02
（`/api/adapters` 可看解析统计）。

## 路由与权限

| URL | 页面 | 谁能进 |
| --- | --- | --- |
| `/` | 找房（瀑布流） | 公开 |
| `/house/:id` | 房源详情 | 公开 |
| `/agent` | AI 找房 | 公开 |
| `/login`、`/register` | 登录 / 注册（独立布局） | 公开 |
| `/favorites`、`/orders`、`/messages`、`/profile`、`/booking/:id` | 租客中心 | 需租客登录 |
| `/merchant/listings`、`/merchant/orders`、`/merchant/profile`、`/merchant/houses/:id/edit` | 商家端 | 需商家登录 |
| `/admin/review` | 管理员端 | 需管理员登录 |

非法访问有两道门：

1. **前端守卫**：未登录 → 跳 `/login?role=xxx&from=<原地址>`；角色不符 → 提示并送回自己的首页
2. **服务端**：所有保护接口都校验 cookie 会话与角色，即使手写 `fetch` 也拿不到数据

```bash
curl http://127.0.0.1:8788/api/merchant/houses   # 未登录 → 401；租客 → 403
```

## 状态为什么不丢

| 状态 | 存在哪 | 刷新 | 关标签再开 |
| --- | --- | --- | --- |
| 登录态 | 服务端 session + httpOnly cookie（7 天） | 保持 | 保持 |
| 收藏 / 订单 / 消息 / 商家编辑 | `runtime/store.json` | 保持 | 保持 |
| 筛选、排序、页签、选中审核单 | URL query（可直接分享链接） | 保持 | 保持 |
| 瀑布流 / 详情浏览位置 | `sessionStorage`（按 fullPath 记 scrollY） | 保持 | 新会话从头开始 |
| 下单表单、商家编辑表单、驳回原因 | 后端草稿 `/api/drafts/*`（防抖 450ms） | 保持 | 保持 |

## 主要接口

| 接口 | 说明 |
| --- | --- |
| `GET /api/meta` | 数据源、筛选字典、设施字典、当前会话与计数 |
| `GET /api/houses?district=&rentMin=&rooms=&sort=&page=` | 房源列表（筛选/排序/分页） |
| `GET /api/houses/:id` | 详情 + 相关推荐 + 是否已收藏 |
| `POST /api/auth/login` \| `/register` \| `/logout` · `GET /api/auth/me` | 认证 |
| `GET/POST /api/favorites` · `GET/POST /api/orders` · `POST /api/orders/:no/cancel` | 收藏与订单 |
| `GET /api/messages` · `POST /api/messages/read-all` | 通知中心 |
| `GET/PUT/DELETE /api/drafts/:key` | 表单草稿 |
| `GET /api/profile` · `PUT /api/profile` | 个人信息 |
| `GET/PUT/POST /api/merchant/houses[...]` · `POST /api/merchant/houses/:id/status` | 商家房源（含新建） |
| `GET /api/merchant/orders` · `POST /api/merchant/orders/:no/{accept,reject,finish}` | 商家订单 |
| `GET/PUT /api/merchant/profile` | 商家信息与资质 |
| `GET /api/admin/reviews` · `POST /api/admin/reviews/:id/{approve,reject}` | 资质审核 |
| `GET /api/adapters` | 兼容器自检（当前数据源、坐标解析方式统计） |
| `GET /api/config-status` · `/api/diag` · `/api/map/image` · `/api/map/regeo` · `/api/stats` | 高德能力（保留，本期不渲染地图） |

## 与旧版 `frontend/` 的关系

- 旧工程 `frontend/`（15 个静态页 + `scripts/build.mjs` 生成器）原样保留在上一级目录，可逐页比对
- `public/style.css` 未改动；新增的只有 `public/js/ui.css` 里的 toast 与加载占位样式
  （复用现有 CSS 变量，不影响任何既有 selector）
- 页面 DOM 与旧版 `scripts/build.mjs` 产出对应关系：
  `shell()` → `components/AppShell.js`，`authShell()` → `components/AuthLayout.js`，
  `card()` → `components/HouseCard.js`，`ICON_DEFS` → `components/IconDefs.js`，
  15 个 `*Body` → `views/**` 下 15 个视图
- 逐页结构核对结论（原版 HTML 的 DOM ↔ SPA 渲染后的 `#app` DOM，`tag.class` 集合比对）：
  15 个业务页**结构元素全部覆盖**；差异仅为等价/增强写法 ——
  `RouterLink` 会带上 `router-link-active` 激活类、`div.result` → `a.result`（可点进详情）、
  `a.btn` → `button.btn`、登录页 `alert` 由 `hidden` 改为 `v-if`
- 未迁移页：旧版 `public/style-lab.html`（设计令牌实验页）不在 SPA 路由里

## 环境变量

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `PORT` / `HOST` | 监听端口 / 地址 | `8788` / `127.0.0.1` |
| `CATALOG_SOURCE` | 数据源：`v2-demo` / `places` | `v2-demo` |
| `STORE_FILE` | 状态文件路径（测试用独立文件） | `runtime/store.json` |
| `AMAP_WEB_KEY` | 覆盖 `config.server.json` 的高德 Web 服务 Key | 读配置文件 |
| `UPSTREAM_GAP_MS` | 高德上游节流间隔 | `500` |

## 排错

| 现象 | 原因与处理 |
| --- | --- |
| 标题正常、页面空白 | 几乎都是前端 ES Module 加载失败：打开 DevTools → Console/Network 看红色报错。历史同类故障见下文「修复记录」 |
| `端口已被占用` | `PORT=8081 node server.mjs` 换端口 |
| 刷新 `/merchant/listings` 404 | 说明不是用 `server.mjs` 起的服务；SPA fallback 在这个服务里实现 |
| 图片全裂 | 检查 `assets/` 是否随仓库一起检出（`.gitattributes` 已按二进制处理） |
| 登录后仍是访客 | 浏览器禁用了 cookie；会话依赖 httpOnly cookie |

## 修复记录

**`views/admin`、`views/merchant` 的相对导入少一层 `../`（整站空白）**

子目录视图原先写 `from '../lib.js'`，实际解析到不存在的 `public/js/views/lib.js`，
导致 `router.js` 的模块图加载失败、`main.js` 整段不执行 —— 表现为「`<title>` 正常、`#app` 永远为空」。
修复为 `../../lib.js`、`../../api.js`、`../../store.js`，涉及 5 个文件 15 行：

```
public/js/views/admin/AdminReview.js
public/js/views/merchant/{MerchantEdit,MerchantListings,MerchantOrders,MerchantProfile}.js
```

验证方式：在 jsdom 里用真实 `vendor/` 运行时挂载应用，逐路由渲染（含三种角色登录态），
16 个路由全部输出内容、运行时错误 0 条；并在 Node 侧做全量 `import` 目标存在性检查与模板编译检查。

## 贡献流程

1. 从最新 `main` 切分支：`git switch -c fix/xxx` 或 `feat/xxx`
2. 提交信息用 `feat:` / `fix:` / `docs:` / `style:` / `refactor:` / `test:` / `chore:` 前缀
3. 提 PR 时按 `.github/pull_request_template.md` 填写（自测步骤、影响范围、截图）
4. 不要提交：`node_modules/`、`runtime/`、`cache/`、`.env`、密钥文件、大二进制文件
