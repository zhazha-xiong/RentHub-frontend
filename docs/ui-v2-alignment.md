# 美术风格与 v2 对齐 · 实施记录

> 目标：新前端（`web/`）每个页面的排版、字体、间距、组件手感都与旧版静态站（`legacy/v2-static/`）一致，
> 同时保留新前端已有的功能（路由守卫、游标分页、SSE、订单状态机、上传、权限）。

## 0. 单一真源

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| 样式 | `src/styles/legacy.css` | 与 `legacy/v2-static/public/style.css` **字节完全一致**（可用 `Get-FileHash` 校验） |
| 补充样式 | `src/styles/global.css` | 只放 v2 没有、SPA 必需的东西：toast、骨架、lightbox、`.info-sticky` 的紧凑化 |
| 字体 | `index.html` | 与 v2 同一个 Google Fonts：IBM Plex Sans 400/500/600 |
| 图片 | `legacy/v2-static/assets/*.jpg` | 9 张 Wikimedia Commons 实拍图，出处见 `assets/credits.json` |

`legacy.css` **不要改**：它是 v2 美术的对照基准，任何「新版需要但不属于 v2」的样式都写进 `global.css`。

## 1. 页面与 v2 模板的对应

| 新前端 | v2 模板 | 用到的结构 |
| --- | --- | --- |
| `layouts/AppLayout.vue` | 所有页面的顶栏 | `.topbar` `.sheet` `.page` `.foot` |
| `views/HomeView.vue` | `index.html` | `.search` `.filters/.frow/.flabel/.modes/.fvals/.opt/.range/.select-sm/.check` `.sortbar` `.masonry` |
| `views/ListingDetailView.vue` | `detail.html` | `.crumbs` `.detail` `.media/.stage/.thumbs` `.panel` `.info` `.spec` `.askai` |
| `components/ListingCard.vue` | `index.html` 的卡片 | `.card` `.thumb(--ar)` `.fav` `.card-body/-title/-meta/-tags/-foot` |
| `views/LoginView.vue` | `login.html` | `.auth` `.auth-art` `.auth-main` `.auth-box` `.role-switch` `.auth-fields` `.alert` `.auth-alt` `.demo-states` |
| `views/RegisterView.vue` | `register.html` | 同上（`.role-switch.two`） |
| `views/AiChatView.vue` | `agent.html` | `.head` `.chatwrap` `.chat` `.thread` `.msg` `.bubble` `.q` `.mini` `.composer` `.side` `.result` |
| `views/FavoritesView.vue` | `favorites.html` | `.sortbar` `.masonry` |
| `views/OrdersView.vue` | `orders.html` | `.tabs` `.order(.top/.body/.foot)` |
| `views/OrderDetailView.vue` | 无（用 v2 现有块拼） | `.split` `.order` `.table` `.summary` |
| `views/BookingView.vue` | `booking.html` | `.form` `.fieldset` `.grid2` `.order` `.summary` |
| `views/NotificationsView.vue` | `messages.html` | `.head` `.unread-chip` `.tabs` `.note(.dot/.nb/.nt/.nx/.tm)` |
| `views/ProfileView.vue` | `profile.html` | `.form` `.fieldset` `.grid2` `.summary` |
| `views/merchant/MerchantListingsView.vue` | `merchant-listings.html` | `.head` `.toolbar` `table.table` |
| `views/merchant/MerchantOrdersView.vue` | `merchant-orders.html` | `.tabs` `table.table` |
| `views/merchant/MerchantListingEditView.vue` | `merchant-edit.html` | `.fieldset` `.grid2` `.with-unit` `.facrow/.chkrow` `.drawer` |
| `views/merchant/MerchantQualificationView.vue` | `merchant-profile.html` | `.form` `.fieldset` `table.table` `.summary` |
| `views/admin/AdminQualificationsView.vue` | `admin-review.html` | `.split` `table.table` `.review-panel` `.shots` |
| `views/admin/AdminListingsView.vue` / `AdminUsersView.vue` | 无（同一套管理端骨架） | `.head` `.toolbar` `table.table` |
| `views/NotFoundView.vue` | 无 | `.empty` |

样式表里剩下的 antd 组件只有：`a-config-provider`（App.vue，主题注入）与 3 个 `a-modal`（订单/房源/用户的确认弹窗）。
其余全部换成 v2 的原生结构，不再有 `rh-*` 之类的自造样式类。

## 2. 看房页右侧信息栏（`.info.info-sticky`）

- 保留 `position: sticky`（这是新版比 v2 多出来的、也是明确要求保留的）。
- v2 的 `.info` 允许很长；sticky 后一旦高于视口，下半截就会被顶出去，必须滚屏才能看完。
- 做法：只压缩信息密度，不改结构 ——
  `padding 24→18`、标题 `22→19`、价格 `34→28`、`.spec` 行距收紧、商家块与操作区、`.askai` 全面收紧；
  矮视口（高度 ≤ 840px）再加一档，隐藏「这套采光和通勤怎么样？」那行提示，保证整栏仍在一屏内。
- 这些覆盖写在 `global.css`，`legacy.css` 保持与 v2 同源。

## 3. 假后端的「真实」图片

v2 的做法是 9 张实拍图 + 手工写 `--ar` 比例。新版沿用同一批图，但不复制文件、也不让前端硬编码任何房源图：

1. `mock/data/photos.mjs` 记录 9 张图的**原图宽高**，以及每套房源的图集（`galleryFor(id)`）。
2. `seed.mjs` 的 `images` 直接用真实照片的 key（`assets/xxx.jpg`）。
3. `mock/server.mjs` 的 `/mock-files/assets/xxx.jpg` 在 Node 端读 `legacy/v2-static/assets/` 回放 jpeg 字节；
   非实拍图（资质证件）才回退到 SVG 占位。演示上传（`upload/*`）按 key 稳定映射到一张真实照片，避免页面出现色块。
4. 列表接口额外返回 `cover_w` / `cover_h`，前端瀑布流的 `--ar` 用真实比例（v2 是手工写的）；
   同时返回 `published_label`（今天上架 / 3 天前上架）与 `stats`（在架 N 套 · 今日新上 M 套），
   上架文案与计数都由后端算，前端不拿浏览器时钟去推断假数据的时间。

## 4. 验证方式（沙箱限制）

| 项 | 结果 |
| --- | --- |
| `vue-tsc --noEmit` | ✅ 通过 |
| 样式对齐审计（`.probe/style-audit.mjs`） | ✅ 全部页面 95–100%，v2 结构类无遗漏 |
| 假后端数据冒烟（`.probe/mock-photo-smoke.mjs`） | ✅ 9 套在架、真实 jpeg、8 张详情图集、筛选可用 |
| `vite build` / `vitest` / `playwright` | ⚠ 沙箱下 esbuild `spawn EPERM`，需在 CI 或有完整权限的环境跑 |

审计脚本的用法：`node .probe/style-audit.mjs`，它会把「页面用到但没有 v2 样式的 class」逐页列出来，
新加页面时先跑一遍，避免又出现自造样式。
