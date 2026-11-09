# 栖居 RentHub 前端（v2 + assets 打包版）

由原来的 `v2/`（页面）与 `assets/`（图片）包装成一个完整的前端工程，
并把之前两个项目里用得到的第三方运行时汇总进 `vendor/`、把高德地图调用方式一并保留。

## 目录

```
frontend/
├─ public/                  页面（浏览器直接访问的根）
│   ├─ *.html               15 个页面 —— build.mjs 的生成物，勿手改
│   ├─ style.css            站点样式（27 个变量驱动的设计令牌）
│   ├─ app.js               站点交互（原生 DOM，无框架）
│   └─ config.js            前端高德配置（AMAP_JS_KEY / 安全密钥 / MAP_ZOOM）
├─ assets/                  9 张房源实拍图 + credits.json（页面用 ../assets/… 引用）
├─ vendor/                  汇总的浏览器运行时（无需 npm install）
│   ├─ vue.global.prod.js          3.5.41
│   ├─ vue-router.global.prod.js   4.6.4
│   ├─ antd/antd.min.js            4.2.6（UMD）+ reset.css
│   └─ dayjs/dayjs.min.js + plugin/（antd UMD 需要的 7 个插件）
├─ data/places.json         175 条大连住宅 POI（GCJ-02），可作房源坐标来源
├─ config.server.json       后端高德 Web 服务 Key
├─ cache/                   高德静态图磁盘缓存（运行时生成）
├─ scripts/build.mjs        页面生成器（15 个页面 + 公共头尾/菜单）
└─ server.mjs               零依赖静态服务 + 高德代理
```

## 启动

```powershell
cd C:\Users\86177\Desktop\实习实训\frontend
node server.mjs            # http://127.0.0.1:8788/
```

端口/监听地址可用 `PORT`、`HOST` 环境变量覆盖。

## 改页面的正确姿势

`public/*.html` 是 `scripts/build.mjs` 写出来的（第 982 行 `fs.writeFileSync`），
**直接改 html 会在下次 build 时被覆盖**：

```powershell
cd C:\Users\86177\Desktop\实习实训\frontend
node scripts/build.mjs      # 重新生成 15 个页面到 public/
```

要改内容/结构就改 `scripts/build.mjs`；要改外观就改 `public/style.css`。

## 保留的高德地图能力（即将用于 v2）

服务端 `server.mjs` 保留了原项目的全部地图相关接口与配套设施：

| 接口 | 用途 |
| --- | --- |
| `GET /api/config-status` | 前端 Key / 后端 Key 是否就绪 |
| `GET /api/diag` | 用 `/v3/ip` 探测 Key 类型是否配对 |
| `GET /api/feed?page=1&size=12` | 房源/POI 分页列表（含 GCJ-02 坐标，可给房源打点） |
| `GET /api/house/:id` | 单条 POI 详情（含坐标与位置描述） |
| `GET /api/map/regeo?lon=&lat=` | 逆地理编码代理（Key 不出后端） |
| `GET /api/map/image?lon=&lat=&w=&h=&zoom=` | 高德静态图代理 |
| `GET /api/stats`、`POST /api/cache/clear` | 缓存统计 / 清空 |

配套设施也都在：内存 LRU + 磁盘 `cache/` + 并发去重 + 上游节流（约 2 QPS）+ 限流（300 次/分）+ WGS-84→GCJ-02 纠偏。

前端接入时的两个来源：

- **Key 配置**：`public/config.js`（JS API Key + 安全密钥，Web端类型）、`config.server.json`（Web 服务 Key）；
- **调用范式**：原前端 `loadAMap()` → `new AMap.Map(el, {...})` → 等 `complete` → 加 `Scale/ToolBar/Marker/InfoWindow`，
  失败时用 `/api/diag` 给出原因。`data/places.json` 里的 `lon/lat` 可直接作为房源坐标。
  `public/config.js` 里的 `MAP_ZOOM` 是详情页默认缩放级别。

> 注意：v2 现有页面是纯原生 HTML/CSS/JS，尚未引入 Vue/antd；
> `vendor/` 是为后续「想用 antd 组件」而预留的，不参与当前页面渲染。

## 依赖说明

- `vendor/` 是**物理汇总**好的运行时（共约 1.7 MB），来自本机已安装的
  `ant-design-vue@4.2.6` / `dayjs@1.11.23` 与 Vue 官方全局构建，版本已在 `package.json` 的 `dependencies` 里声明。
- 运行本项目**不需要** `node_modules`，也不需要联网装包。
