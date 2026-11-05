# 栖居 RentHub · Vue 3 单页应用

把原 `frontend/`（v2 的 15 个静态页）重写成 **Vue 3 + Vue Router** 的 SPA：
页面排版、class 结构、`style.css` **一个字都没改**，只把「数据来源」和「页面跳转方式」换掉了。

```powershell
cd C:\Users\86177\Desktop\实习实训\frontend-vue
node server.mjs            # http://127.0.0.1:8788/
```

- 不需要 `npm install`：Vue / Vue Router 用的是 `vendor/` 里的官方浏览器全局构建
- 不需要构建工具：前端就是浏览器原生 ES Module，改完文件刷新即生效
- 端口/监听地址：`PORT`、`HOST` 环境变量覆盖

## 演示账号（密码都是 `renthub123`）

| 入口 | 账号 | 登录后落地页 |
| --- | --- | --- |
| 租客 | `xiaofs` | `/` |
| 商家 | `xingchen` | `/merchant/listings` |
| 管理员 | `guanli` | `/admin/review` |

登录页底部「原型演示：密码错误 · 入口不符 · 账号锁定」三个链接仍可点，
点击后的提示文案与 v2 完全一致；其中「账号锁定」不是假文案 —— 后端真的会
在连续 5 次密码错误后锁 15 分钟。

## 要求对照

| 要求 | 落地方式 |
| --- | --- |
| 保留 v2 美术风格、排版一点不改 | `public/style.css` 与旧版**逐字节一致**（SHA256 相同）；每个页面的 DOM 结构与 class 与 `scripts/build.mjs` 生成的 HTML 一一对应 |
| 组装成前端项目，node 启动 | `node server.mjs`，零依赖、无构建步骤 |
| Vue 3 + Vue Router 路由，减少非法用户通过链接访问 | History 模式 + 全局守卫（`public/js/router.js`）+ **服务端 session 角色校验**（`server/session.mjs`） |
| 后端数据结构不确定 → 先做兼容器 | `server/data/schema.mjs` 统一模型 + `server/data/adapters/*` 适配器，见下文 |
| 房源抽象出编号/图片/描述/tag/坐标/地点 | 统一 House 模型，见 `server/data/schema.mjs` 顶部注释 |
| 数据挪到后端 | 页面里没有任何写死的房源/订单/消息数据，全部 `/api/*` |
| 收藏、订单、房子、瀑布流、消息链接相同、刷新不丢状态 | 每条都是稳定 URL；筛选/分页/页签状态写在 URL query；浏览位置存 sessionStorage；填写内容存后端草稿 |
| 登录、商家端、管理员端单独 URL | `/login`、`/merchant/*`、`/admin/*` |

## 目录

```
frontend-vue/
├─ server.mjs                  HTTP 服务：静态托管 + SPA fallback + /api 分发
├─ server/
│  ├─ api.mjs                  全部 REST 接口（鉴权 + 业务）
│  ├─ store.mjs                runtime/store.json 持久化（原子写、防抖）
│  ├─ session.mjs              httpOnly cookie 会话 + 登录失败锁定
│  ├─ amap.mjs                 高德代理（保留能力，本期不渲染地图）
│  └─ data/
│     ├─ schema.mjs            统一房源模型 + normalizeHouse() 兼容归一化
│     ├─ catalog.mjs           数据源装配、坐标解析、筛选/排序/分页
│     └─ adapters/
│        ├─ v2demo.mjs         v2 的 9 条演示房源（默认数据源）
│        └─ places.mjs         places.json 的 175 条大连 POI（备用数据源 + 坐标字典）
├─ public/                     浏览器根
│  ├─ index.html               SPA 外壳
│  ├─ style.css                ★ 与旧版逐字节一致，不要改
│  ├─ config.js                高德前端配置（本期未使用）
│  └─ js/
│     ├─ main.js  lib.js  api.js  store.js  router.js  App.js  ui.css
│     ├─ components/           AppShell / AuthLayout / HouseCard / IconDefs / ToastHost
│     └─ views/                Home / Detail / Agent / Booking / Orders / Favorites /
│                              Messages / Profile / Login / Register / NotFound
│                              merchant/{Listings,Edit,Orders,Profile}  admin/Review
├─ assets/                     9 张实拍图 + credits.json
├─ vendor/                     vue.global.prod.js / vue-router.global.prod.js
├─ data/places.json            175 条 GCJ-02 坐标
├─ runtime/store.json          运行状态（收藏/订单/消息/草稿/会话/商家编辑），首次启动生成
└─ config.server.json          高德 Web 服务 Key（仅后端使用）
```

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

试试换数据源（175 条 POI 当房源列表，前端完全不用改）：

```powershell
$env:CATALOG_SOURCE='places'; node server.mjs
```

坐标：v2 数据本身没有经纬度，`catalog.mjs` 用 `places.json` 按行政区算质心锚点 +
确定性偏移补全，**每次启动结果都一样**；能在 POI 里按小区名匹配到就用真实坐标。
所有坐标统一为高德 GCJ-02（`/api/adapters` 可看解析统计）。

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

```powershell
# 未登录直接打接口 → 401；租客打商家接口 → 403
curl http://127.0.0.1:8788/api/merchant/houses
```

## 状态为什么不丢

| 状态 | 存在哪 | 刷新 | 关标签再开 |
| --- | --- | --- | --- |
| 登录态 | 服务端 session + httpOnly cookie（7 天） | 保持 | 保持 |
| 收藏 / 订单 / 消息 / 商家编辑 | `runtime/store.json` | 保持 | 保持 |
| 筛选、排序、页签、选中审核单 | URL query（可直接分享链接） | 保持 | 保持 |
| 瀑布流/详情浏览位置 | `sessionStorage`（按 fullPath 记 scrollY） | 保持 | 新会话从头开始 |
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

## 与旧版的关系

- 旧工程 `frontend/` 原样保留，可 `node server.mjs`（8788）逐页比对
- `public/style.css` 未改动；新增的只有 `public/js/ui.css` 里的 toast 与加载占位样式
  （用现有 CSS 变量，不影响任何既有 selector）
- 页面 DOM 与旧版 `scripts/build.mjs` 产出对应关系：
  `shell()` → `components/AppShell.js`，`authShell()` → `components/AuthLayout.js`，
  `card()` → `components/HouseCard.js`，`ICON_DEFS` → `components/IconDefs.js`，
  15 个 `*Body` → `views/**` 下 15 个视图

## 环境变量

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `PORT` / `HOST` | 监听地址 | `8788` / `127.0.0.1` |
| `CATALOG_SOURCE` | 数据源：`v2-demo` / `places` | `v2-demo` |
| `STORE_FILE` | 状态文件路径（测试用独立文件） | `runtime/store.json` |
| `AMAP_WEB_KEY` | 覆盖 `config.server.json` 的高德 Web 服务 Key | 读配置文件 |
| `UPSTREAM_GAP_MS` | 高德上游节流间隔 | `500` |

## 已知边界

1. 地图未接：数据层保留了 `coord{lon,lat,sys}`，`/api/map/*` 代理也还在，
   接 UI 时只需在详情页「位置与交通」板块里挂 `new AMap.Map(...)`。
2. 注册的商家初始资质为「待审核」，需管理员通过后才能上架（符合原型设定）。
3. 支付为模拟：点「模拟支付」直接生成订单与流水，不接真实支付。
4. 图片上传未做真实上传，沿用 `assets/` 的演示图。
