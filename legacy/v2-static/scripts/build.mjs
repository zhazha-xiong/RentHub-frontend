import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 输出到工程根的 public/；页面里引用的 ../assets/ 相对 public/ 解析到 frontend/assets/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public");

const A = "../assets/";
const P = {
  l1: A + "modern-living-room-with-stylish-furniture-and.jpg",
  l2: A + "living-room-in-apartment-of-condominio-do.jpg",
  l3: A + "the-living-room-that-needs-houseplants.jpg",
  l4: A + "new-orleans-french-quarter-apartment-living-room.jpg",
  b1: A + "bedroom-interior-of-apartment-in-brisbane-2025.jpg",
  b2: A + "bedroom-interior-of-apartment-in-brisbane-2025-2.jpg",
  k1: A + "kitchen-interior-of-apartment-in-brisbane-2025.jpg",
  k2: A + "apartment-kitchen-5170875449.jpg",
  bd: A + "apartment-building-in-china.jpg",
};

const L = [
  { id: 1, p: P.l1, ar: "16/9", t: "星海广场 · 2室1厅", m: "沙河口 · 86㎡ · 南北 · 14/26层 · 精装", tags: ["近地铁", "有电梯"], w: "3 天前", price: 3200 },
  { id: 2, p: P.b1, ar: "2/3", t: "和平广场 · 1室1厅", m: "沙河口 · 52㎡ · 朝南 · 6/18层 · 简装", tags: ["有电梯"], w: "5 天前", price: 1850 },
  { id: 3, p: P.l2, ar: "1/1", t: "软件园 · 2室2厅", m: "高新园区 · 98㎡ · 东南 · 9/32层 · 精装", tags: ["近地铁", "有电梯"], w: "今天", price: 4100 },
  { id: 4, p: P.b2, ar: "3/4", t: "青泥洼桥 · 单间", m: "中山 · 38㎡ · 朝东 · 4/7层 · 简装", tags: ["近地铁", "合租"], w: "昨天", price: 1200 },
  { id: 5, p: P.l3, ar: "3/2", t: "人民广场 · 3室2厅", m: "西岗 · 128㎡ · 南北 · 3/6层 · 豪装", tags: ["有电梯"], w: "8 天前", price: 5600 },
  { id: 6, p: P.k1, ar: "4/3", t: "西安路 · 2室1厅", m: "沙河口 · 78㎡ · 朝南 · 12/24层 · 精装", tags: ["近地铁", "有电梯"], w: "今天", price: 2650 },
  { id: 7, p: P.k2, ar: "3/2", t: "光明街 · 2室1厅", m: "金州 · 90㎡ · 东西 · 2/6层 · 简装", tags: [], w: "12 天前", price: 1900 },
  { id: 8, p: P.l4, ar: "1/1", t: "华南广场 · 1室1厅", m: "甘井子 · 45㎡ · 朝北 · 5/18层 · 精装", tags: ["有电梯"], w: "2 天前", price: 1550 },
  { id: 9, p: P.bd, ar: "2/3", t: "旅顺口 · 2室1厅", m: "旅顺口 · 82㎡ · 朝南 · 8/11层 · 简装", tags: [], w: "6 天前", price: 1600 },
];

const fmt = (n) => n.toLocaleString("en-US");
const yuan = (n) => n.toLocaleString("en-US");

const card = (d) => `
      <a class="card" href="detail.html">
        <div class="thumb" style="--ar:${d.ar}">
          <img src="${d.p}" alt="房源室内实拍，教学演示图片" loading="lazy">
          <button class="fav" aria-label="收藏 ${d.t}">收藏</button>
        </div>
        <div class="card-body">
          <h3 class="card-title">${d.t}</h3>
          <p class="card-meta">${d.m}</p>
          ${d.tags.length ? `<p class="card-tags">${d.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</p>` : ""}
          <p class="card-foot"><span class="when">${d.w}上架</span><span class="price"><b>${fmt(d.price)}</b> 元/月</span></p>
        </div>
      </a>`;

const miniCard = (d) => `
          <a href="detail.html">
            <img src="${d.p}" alt="" loading="lazy">
            <div class="b"><p class="t">${d.t.replace(" · ", " ")}</p><p class="p"><b>${fmt(d.price)}</b> 元/月</p></div>
          </a>`;

const ROLES = {
  tenant: {
    links: [["index.html", "找房"]],
    menu: [["favorites.html", "我的收藏", 6], ["orders.html", "我的订单", 2], ["messages.html", "通知中心", 3], ["profile.html", "个人信息", 0]],
  },
  merchant: {
    links: [["merchant-listings.html", "房源管理"], ["merchant-orders.html", "订单管理"]],
    menu: [["merchant-listings.html", "我的房源", 5], ["merchant-orders.html", "订单管理", 2], ["merchant-profile.html", "商家信息与资质", 0]],
  },
  admin: {
    links: [["admin-review.html", "资质审核"]],
    menu: [["admin-review.html", "资质审核", 2], ["#", "用户管理", 0], ["#", "房源管理", 0], ["#", "订单查看", 0]],
  },
};

const ACCOUNT = {
  tenant: { name: "肖福晟", initial: "肖" },
  merchant: { name: "星辰公寓", initial: "星" },
  admin: { name: "管理员", initial: "管" },
};

const DEMO = {
  tenant: [["merchant-listings.html", "商家端"], ["admin-review.html", "管理员端"]],
  merchant: [["index.html", "租客端"], ["admin-review.html", "管理员端"]],
  admin: [["index.html", "租客端"], ["merchant-listings.html", "商家端"]],
};
const demoLinks = (role) => DEMO[role].map(([h, t]) => `<a role="menuitem" href="${h}">${t}</a>`).join("");

function shell(role, active, { title, body, pageClass = "" }) {
  const r = ROLES[role];
  const a = ACCOUNT[role];
  const links = r.links
    .map(([h, t]) => `<a href="${h}"${h === active ? ' aria-current="page"' : ""}>${t}</a>`)
    .join("");
  const menu = r.menu
    .map(([h, t, n]) => `<a href="${h}"${h === active ? ' aria-current="page"' : ""}>${t}${n ? `<span class="badge">${n}</span>` : ""}</a>`)
    .join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · 栖居 RentHub</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="index.html">栖居<span class="brand-en">RentHub</span></a>
    <button class="city" type="button">大连<span class="chev">▾</span></button>
    <nav class="links">${links}</nav>
    <div class="account">
      <button class="avatar-btn" aria-haspopup="menu" aria-expanded="false" id="acct">
        <span class="avatar">${a.initial}</span><span class="uname">${a.name}</span><span class="chev">▾</span>
      </button>
      <div class="menu" role="menu" id="menu" hidden>
        ${menu}
        <hr>
        <p class="menu-label">原型演示：切换端</p>
        ${demoLinks(role)}
        <hr>
        <a role="menuitem" href="login.html">退出登录</a>
      </div>
    </div>
  </header>
  <div class="sheet">
    <div class="page ${pageClass}">
${body}
      <footer class="foot">
        <span>栖居 RentHub · 大连 · 教学演示数据</span>
        <span>演示图片来自 Wikimedia Commons（CC0 / CC BY 2.0 / CC BY-SA 4.0），出处见 credits.json</span>
      </footer>
    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>`;
}

/* ============================ 1 · 列表 ============================ */
const listBody = `
      <h1>大连租房</h1>

      <form class="search" role="search" onsubmit="return false">
        <input type="search" aria-label="用一句话描述你想找的房子" placeholder="说说你想住哪儿，例如「沙河口 两室 3000 以内 有电梯」">
        <a class="btn" href="agent.html" style="display:inline-flex;align-items:center;text-decoration:none">问 AI</a>
      </form>

      <section class="filters" aria-label="筛选">
        <div class="frow">
          <span class="flabel">位置</span>
          <div class="modes" role="tablist" aria-label="位置方式">
            <button class="mode is-on" role="tab" aria-selected="true" data-mode="region">区域</button>
            <button class="mode" role="tab" aria-selected="false" data-mode="metro">地铁</button>
          </div>
          <div class="fvals" id="f-region">
            <button class="opt is-on" aria-pressed="true">全部</button>
            <button class="opt">沙河口</button><button class="opt">中山</button><button class="opt">西岗</button>
            <button class="opt">甘井子</button><button class="opt">高新园区</button><button class="opt">金州</button>
            <button class="opt">开发区</button><button class="opt">旅顺口</button>
          </div>
          <div class="fvals" id="f-metro" hidden>
            <button class="opt is-on" aria-pressed="true">全部</button>
            <button class="opt">1 号线</button><button class="opt">2 号线</button><button class="opt">3 号线</button>
            <button class="opt">5 号线</button><button class="opt">12 号线</button>
          </div>
        </div>
        <div class="frow">
          <span class="flabel">租金</span>
          <div class="fvals">
            <button class="opt is-on" aria-pressed="true">全部</button>
            <button class="opt">500 元以下</button><button class="opt">500–800 元</button><button class="opt">800–1000 元</button>
            <button class="opt">1000–1500 元</button><button class="opt">1500–2000 元</button><button class="opt">2000–3000 元</button>
            <button class="opt">3000–5000 元</button><button class="opt">5000 元以上</button>
            <span class="range"><input type="text" inputmode="numeric" aria-label="最低租金" placeholder="最低"> – <input type="text" inputmode="numeric" aria-label="最高租金" placeholder="最高"> 元</span>
          </div>
        </div>
        <div class="frow">
          <span class="flabel">房型</span>
          <div class="fvals">
            <button class="opt is-on" aria-pressed="true">全部</button>
            <button class="opt">一室</button><button class="opt">二室</button><button class="opt">三室</button>
            <button class="opt">四室</button><button class="opt">五室及以上</button>
          </div>
        </div>
        <div class="frow">
          <span class="flabel">类型</span>
          <div class="fvals">
            <button class="opt is-on" aria-pressed="true">全部</button>
            <button class="opt">整租</button><button class="opt">合租/单间</button>
          </div>
        </div>
        <div class="frow">
          <span class="flabel">更多</span>
          <div class="fvals">
            <select class="select-sm" aria-label="房屋类型"><option>房屋类型</option><option>普通住宅</option><option>公寓</option><option>别墅</option><option>商住两用</option></select>
            <select class="select-sm" aria-label="朝向"><option>朝向</option><option>朝南</option><option>南北</option><option>东南</option><option>东</option></select>
            <label class="check"><input type="checkbox"> 电梯房</label>
          </div>
        </div>
      </section>

      <div class="sortbar">
        <div class="sorts">
          <button class="sort is-on" aria-pressed="true">综合</button>
          <button class="sort">最新</button>
          <button class="sort">价格 ↑</button>
          <button class="sort">价格 ↓</button>
        </div>
        <p class="note">9 套在架 · 今日新上 2 套</p>
      </div>

      <section class="masonry">${L.map(card).join("")}</section>`;

const ICON_DEFS = `
  <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <symbol id="i-tv" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M9 21h6M12 17v4"/></symbol>
    <symbol id="i-ac" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="7" rx="2"/><path d="M7 15v2M12 15v3M17 15v2"/></symbol>
    <symbol id="i-wardrobe" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18M9 10v3M15 10v3"/></symbol>
    <symbol id="i-bed" viewBox="0 0 24 24"><path d="M3 19v-7h18v7"/><path d="M3 12V8h7v4"/><path d="M3 19h18M3 19v2M21 19v2"/></symbol>
    <symbol id="i-bath" viewBox="0 0 24 24"><path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3Z"/><path d="M7 12V6a2 2 0 0 1 4 0"/><path d="M6 19l-1 2M18 19l1 2"/></symbol>
    <symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V8a4 4 0 0 1 8 0v2"/><circle cx="12" cy="15" r="1.3"/></symbol>
    <symbol id="i-balcony" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/></symbol>
    <symbol id="i-heater" viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1"/><path d="M8 6v12M12 6v12M16 6v12"/></symbol>
    <symbol id="i-fridge" viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M6 11h12M9 7v2M9 14v2"/></symbol>
    <symbol id="i-washer" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="17" rx="1.5"/><circle cx="12" cy="13" r="4"/><circle cx="8" cy="7.5" r=".9"/></symbol>
    <symbol id="i-water" viewBox="0 0 24 24"><circle cx="12" cy="10" r="5"/><path d="M8 15v4M16 15v4M6 19h12"/></symbol>
    <symbol id="i-wifi" viewBox="0 0 24 24"><path d="M4 9a12 12 0 0 1 16 0"/><path d="M7 12.5a8 8 0 0 1 10 0"/><path d="M10 16a4 4 0 0 1 4 0"/><circle cx="12" cy="19" r=".9"/></symbol>
    <symbol id="i-sofa" viewBox="0 0 24 24"><rect x="3" y="10" width="18" height="7" rx="2"/><path d="M6 10V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/><path d="M5 17v2M19 17v2"/></symbol>
    <symbol id="i-hood" viewBox="0 0 24 24"><path d="M4 10h16l-3-5H7l-3 5Z"/><path d="M12 10v4"/><circle cx="12" cy="16" r="1"/></symbol>
    <symbol id="i-stove" viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="11" rx="2"/><circle cx="8" cy="14" r="1.6"/><circle cx="16" cy="14" r="1.6"/></symbol>
    <symbol id="i-cook" viewBox="0 0 24 24"><path d="M5 11h14l-1.5 8h-11L5 11Z"/><path d="M9 8c0-1 1-1 1-2M13 8c0-1 1-1 1-2"/></symbol>
  </defs></svg>`;

const FAC_BED = [["i-tv", "电视"], ["i-ac", "空调"], ["i-wardrobe", "衣柜"], ["i-bed", "床"],
  ["i-bath", "卫生间"], ["i-lock", "智能门锁"], ["i-balcony", "阳台"], ["i-heater", "暖气"]];
const FAC_PUB = [["i-fridge", "冰箱"], ["i-washer", "洗衣机"], ["i-water", "热水器"], ["i-wifi", "宽带"],
  ["i-sofa", "沙发"], ["i-hood", "油烟机"], ["i-stove", "燃气灶"], ["i-cook", "可做饭"]];

/* ============================ 2 · 详情 ============================ */
const detailBody = `
      ${ICON_DEFS}
      <p class="crumbs"><a href="index.html">找房</a><span>/</span>沙河口<span>/</span>星海广场</p>
      <div class="detail">
        <div>
          <div class="media">
            <div class="stage">
              <img src="${P.l1}" alt="客厅实拍，教学演示图片">
              <button class="nav prev" aria-label="上一张">‹</button>
              <button class="nav next" aria-label="下一张">›</button>
              <span class="counter">1 / 8</span>
            </div>
            <div class="thumbs">
              <button class="th on" aria-label="第 1 张"><img src="${P.l1}" alt=""></button>
              <button class="th" aria-label="第 2 张"><img src="${P.k1}" alt=""></button>
              <button class="th" aria-label="第 3 张"><img src="${P.b1}" alt=""></button>
              <button class="th" aria-label="第 4 张"><img src="${P.b2}" alt=""></button>
              <button class="th more" aria-label="查看全部 8 张">+4</button>
            </div>
          </div>
          <section class="panel">
            <h2>房源描述</h2>
            <p class="prose">房子在星海广场东侧，步行到地铁 1 号线约 320 米。南北通透，主卧朝南，客厅带 3.6 米宽阳台。
            房东自住装修，家电齐全，可拎包入住。楼下有便利店与菜市场，小区 24 小时门禁。</p>
            <div class="kv">
              <span><b>付款方式</b> 押一付三</span>
              <span><b>最短租期</b> 6 个月</span>
              <span><b>看房</b> 随时可看</span>
              <span><b>车位</b> 小区地下车库，另计</span>
            </div>
          </section>
          <section class="panel">
            <h2>位置与交通</h2>
            <p class="prose">大连市沙河口区星海广场东路 6 号 3 单元 1402。</p>
            <div class="kv">
              <span><b>小区</b> 星海广场</span>
              <span><b>地铁</b> 1 号线</span>
              <span><b>步行</b> 320 米</span>
            </div>
          </section>

          <section class="panel">
            <h2>卧室设施</h2>
            <div class="facgrid">
              ${FAC_BED.map(([id, name]) => `<div class="fac"><svg class="ic" aria-hidden="true"><use href="#${id}"/></svg><span>${name}</span></div>`).join("")}
            </div>
            <h2 style="margin-top:24px">公共设施</h2>
            <div class="facgrid">
              ${FAC_PUB.map(([id, name]) => `<div class="fac"><svg class="ic" aria-hidden="true"><use href="#${id}"/></svg><span>${name}</span></div>`).join("")}
            </div>
          </section>

          <section class="panel">
            <h2>相关推荐</h2>
            <p class="hint" style="margin:0 0 12px">同区域、同户型、价格接近的 3 套</p>
            <div class="related">
              ${L.slice(5, 8).map((d) => `<a class="rel" href="detail.html">
                <img src="${d.p}" alt="">
                <p class="t">${d.t}</p>
                <p class="m">${d.m.split(" · ")[1]} · ${d.m.split(" · ")[3] || ""}</p>
                <p class="p"><b>${fmt(d.price)}</b> 元/月</p>
              </a>`).join("")}
            </div>
          </section>
        </div>

        <aside class="info">
          <h1 class="title">星海广场 · 2室1厅</h1>
          <p class="meta">沙河口 · 86㎡ · 南北 · 14/26 层 · 精装</p>
          <div class="price-row"><b>3,200</b><span>元/月 · 押金 3,200 · 服务费 160</span></div>
          <div class="tags">
            <span class="tag">近地铁</span><span class="tag">有电梯</span><span class="tag">精装</span>
            <span class="tag hue">3 天内新上</span><span class="tag plain">随时看房</span>
          </div>
          <dl class="spec">
            <div><dt>户型</dt><dd>2 室 1 厅 1 卫</dd></div>
            <div><dt>面积</dt><dd>86 ㎡</dd></div>
            <div><dt>楼层</dt><dd>14 / 26 层</dd></div>
            <div><dt>朝向</dt><dd>南北</dd></div>
            <div><dt>装修</dt><dd>精装</dd></div>
            <div><dt>类型</dt><dd>普通住宅</dd></div>
            <div><dt>租赁</dt><dd>整租</dd></div>
            <div><dt>可入住</dt><dd>2026-12-01</dd></div>
          </dl>
          <div class="merchant">
            <span class="ava">星</span>
            <div><b>星辰公寓</b><p>3 套在架 · 资质已认证 · 平均响应 1 小时</p></div>
          </div>
          <div class="actions">
            <button class="btn ghost">收藏</button>
            <a class="btn" href="booking.html" style="display:flex;align-items:center;justify-content:center;text-decoration:none">立即租下</a>
          </div>

          <div class="askai">
            <div class="ah"><span class="dot-ai" aria-hidden="true"></span><b>问问 AI</b></div>
            <p class="q1">「这套采光和通勤怎么样？」</p>
            <div class="qh">
              <button type="button">离地铁多远</button>
              <button type="button">和附近同价位比</button>
            </div>
            <form class="qform" onsubmit="return false">
              <input type="text" placeholder="就这套继续问" aria-label="就这套继续问">
              <button class="btn sm" type="submit">发送</button>
            </form>
          </div>
        </aside>
      </div>`;

/* ============================ 3 · AI Agent ============================ */
const agentBody = `
      <div class="crumbs"><a href="index.html">找房</a><span>/</span>AI 找房</div>
      <div class="head">
        <div>
          <h1>AI 找房</h1>
        </div>
        <div class="right"><a class="btn ghost" href="index.html" style="display:inline-flex;align-items:center;text-decoration:none">回到列表</a></div>
      </div>

      <div class="chatwrap">
        <div class="chat">
          <div class="thread" id="thread">
            <div class="msg user">
              <p class="who"><span class="ava-u">肖</span></p>
              <div class="bubble">沙河口 两室 3000 以内 有电梯</div>
            </div>

            <div class="msg agent">
              <p class="who"><span class="ava-a">助</span>找房助手</p>
              <div class="bubble">
                我识别到三个条件：<b>租金 ≤ 3000</b>、<b>二室</b>、<b>有电梯</b>。还有一个不确定：「沙河口」可以指行政区，也可以指附近的片区，你要哪一个？
                <div class="q">
                  <button>沙河口区 · 18 套</button>
                  <button>星海广场 · 4 套</button>
                  <button>西安路 · 6 套</button>
                  <button class="skip">跳过</button>
                </div>
              </div>
            </div>

            <div class="msg user">
              <p class="who"><span class="ava-u">肖</span></p>
              <div class="bubble">沙河口区</div>
            </div>

            <div class="msg agent">
              <p class="who"><span class="ava-a">助</span>找房助手</p>
              <div class="bubble">
                按「沙河口区 · 二室 · ≤3000 · 有电梯」共找到 6 套，按综合排序先看这 3 套：
                <div class="mini">${miniCard(L[0])}${miniCard(L[5])}${miniCard(L[1])}</div>
              </div>
              <div class="q">
                <button>只要近地铁</button>
                <button>面积 80 平以上</button>
                <button class="skip">就这些</button>
              </div>
            </div>

            <div class="msg user">
              <p class="who"><span class="ava-u">肖</span></p>
              <div class="bubble">第二套离地铁远吗</div>
            </div>

            <div class="msg agent">
              <p class="who"><span class="ava-a">助</span>找房助手</p>
              <div class="bubble">
                第二套「西安路 · 2室1厅」登记的地铁线路是 1 号线，地址在西安路 6 号，步行约 480 米；第一套「星海广场」是 320 米。
                它比第一套远 160 米，租金低 550 元/月，面积小 8 ㎡。
              </div>
              <p class="hint">这两条信息来自房源登记的字段与地址，未填写的字段不会被推测。</p>
            </div>
          </div>

          <form class="composer" onsubmit="return false">
            <textarea aria-label="继续提问" placeholder="继续问，例如「这两套哪个更划算」"></textarea>
            <button class="btn send" type="submit">发送</button>
          </form>
          <p class="hint">Enter 发送 · Shift + Enter 换行 · 回答基于房源结构化字段与平台统计</p>
        </div>

        <aside class="side">
          <div class="hd"><b>本次候选</b><span>4 套</span></div>
          <div class="result">
            <img src="${P.l1}" alt=""><div><p class="t">星海广场 · 2室1厅</p><p class="m">86㎡ · 南北 · 320 m 到地铁</p><p class="p"><b>3,200</b> 元/月</p></div>
          </div>
          <div class="result">
            <img src="${P.k1}" alt=""><div><p class="t">西安路 · 2室1厅</p><p class="m">78㎡ · 朝南 · 480 m 到地铁</p><p class="p"><b>2,650</b> 元/月</p></div>
          </div>
          <div class="result">
            <img src="${P.b1}" alt=""><div><p class="t">和平广场 · 1室1厅</p><p class="m">52㎡ · 朝南 · 有电梯</p><p class="p"><b>1,850</b> 元/月</p></div>
          </div>
          <div class="result">
            <img src="${P.b2}" alt=""><div><p class="t">马栏广场 · 2室1厅</p><p class="m">74㎡ · 南北 · 有电梯</p><p class="p"><b>2,300</b> 元/月</p></div>
          </div>
          <button class="btn ghost" style="width:100%;margin-top:12px">生成对比表</button>
        </aside>
      </div>`;

/* ============================ 4 · 下单 ============================ */
const bookingBody = `
      <p class="crumbs"><a href="index.html">找房</a><span>/</span><a href="detail.html">星海广场 · 2室1厅</a><span>/</span>确认订单</p>
      <h1>确认订单</h1>
      

      <div class="form">
        <div>
          <div class="fieldset">
            <h2>房源</h2>
            <div class="order">
              <div class="body">
                <img src="${P.l1}" alt="">
                <div>
                  <p class="t">星海广场 · 2室1厅</p>
                  <p class="m">沙河口 · 86㎡ · 南北 · 14/26 层 · 精装</p>
                  <p class="m">商家：星辰公寓 · 资质已认证</p>
                </div>
                <div class="amt"><b>3,200</b> 元/月<p>押金 3,200 元</p></div>
              </div>
            </div>
          </div>

          <div class="fieldset">
            <h2>租约信息</h2>
            <div class="grid2">
              <div class="field"><label for="months">租期</label>
                <select id="months"><option>3 个月</option><option>6 个月</option><option selected>12 个月</option><option>24 个月</option></select>
              </div>
              <div class="field"><label for="date">入住日期</label><input type="date" id="date" value="2026-12-01"></div>
              <div class="field"><label for="guests">入住人数</label><input type="number" id="guests" value="2" min="1" max="8"></div>
              <div class="field"><label for="phone">联系方式</label><input type="text" id="phone" value="138 **** 6621"></div>
              <div class="field wide"><label for="note">备注（选填）</label><textarea id="note" rows="3" placeholder="例如：希望能留一个书桌位，周末看房"></textarea></div>
            </div>
          </div>

          <p class="hint">订单提交后房源会锁定，商家在 24 小时内确认；未确认前你可以随时取消，款项原路退回。</p>
        </div>

        <aside class="summary">
          <h2>金额明细</h2>
          <div class="row"><span>月租 3,200 × 12 个月</span><b>38,400</b></div>
          <div class="row"><span>押金</span><b>3,200</b></div>
          <div class="row"><span>服务费（月租 5%）</span><b>160</b></div>
          <div class="total"><span>应付总额</span><b>41,760</b></div>
          <button class="btn">模拟支付</button>
          <p class="fine">演示环境不接真实支付，点击即视为支付成功并生成支付流水。</p>
        </aside>
      </div>`;

/* ============================ 5 · 我的订单 ============================ */
const order = (o) => `
      <article class="order">
        <div class="top">
          <span>订单号 ${o.no}</span><span>${o.time}</span>
          <span class="st"><span class="tag ${o.cls}">${o.state}</span></span>
        </div>
        <div class="body">
          <img src="${o.img}" alt="">
          <div>
            <p class="t">${o.t}</p>
            <p class="m">${o.m}</p>
            <p class="m">租期 ${o.months} · 入住 ${o.date}</p>
          </div>
          <div class="amt"><b>${o.total}</b><p>含押金 ${o.dep}</p></div>
        </div>
        <div class="foot">${o.actions}</div>
      </article>`;

const ordersBody = `
      <h1>我的订单</h1>
      <nav class="tabs">
        <a href="#" class="on">全部 <span class="n">5</span></a>
        <a href="#">待确认 <span class="n">1</span></a>
        <a href="#">已确认 <span class="n">1</span></a>
        <a href="#">已完成 <span class="n">2</span></a>
        <a href="#">已取消 <span class="n">1</span></a>
      </nav>
${order({
  no: "RH20261104001", time: "2026-11-04 10:22", state: "待商家确认", cls: "warn",
  img: P.l1, t: "星海广场 · 2室1厅", m: "沙河口 · 86㎡ · 南北", months: "12 个月", date: "2026-12-01",
  total: "41,760", dep: "3,200",
  actions: `<button class="btn ghost sm">取消订单</button><button class="btn sm">联系商家</button>`,
})}
${order({
  no: "RH20261028007", time: "2026-10-28 19:40", state: "已确认", cls: "",
  img: P.l2, t: "软件园 · 2室2厅", m: "高新园区 · 98㎡ · 东南", months: "6 个月", date: "2026-11-20",
  total: "28,905", dep: "4,100",
  actions: `<button class="btn ghost sm" disabled>取消订单</button><button class="btn sm">联系商家</button>`,
})}
${order({
  no: "RH20260715003", time: "2026-07-15 09:12", state: "已完成", cls: "plain",
  img: P.k1, t: "西安路 · 2室1厅", m: "沙河口 · 78㎡ · 朝南", months: "12 个月", date: "2026-08-01",
  total: "34,583", dep: "2,650",
  actions: `<button class="btn ghost sm">查看详情</button>`,
})}
${order({
  no: "RH20260620011", time: "2026-06-20 15:03", state: "已取消", cls: "plain",
  img: P.b1, t: "和平广场 · 1室1厅", m: "沙河口 · 52㎡ · 朝南", months: "3 个月", date: "2026-07-01",
  total: "6,205", dep: "1,850",
  actions: `<button class="btn ghost sm">退款记录</button>`,
})}`;

/* ============================ 6 · 收藏夹 ============================ */
const favoritesBody = `
      <h1>我的收藏</h1>
      
      <div class="sortbar">
        <div class="sorts">
          <button class="sort is-on" aria-pressed="true">最近收藏</button>
          <button class="sort">价格从低到高</button>
        </div>
        <p class="note">共 6 套</p>
      </div>
      <section class="masonry">${L.slice(0, 6).map(card).join("")}</section>`;

/* ============================ 7 · 消息 ============================ */
const msg = (m) => `
      <article class="note${m.unread ? " unread" : ""}">
        <span class="dot" aria-hidden="true"></span>
        <div class="nb">
          <p class="nt">${m.t}</p>
          <p class="nx">${m.body}</p>
        </div>
        <time class="tm">${m.time}</time>
      </article>`;

const messagesBody = `
      <div class="head">
        <h1>通知中心<span class="unread-chip">3 条未读</span></h1>
        <div class="right"><button class="btn ghost sm">全部标为已读</button></div>
      </div>
      <nav class="tabs"><a href="#" class="on">全部</a><a href="#">订单</a><a href="#">房源</a><a href="#">系统</a></nav>
${msg({ t: "商家已接单", body: "星辰公寓已确认你的订单 RH20261104001，房源已为你锁定。", time: "10 分钟前", unread: true })}
${msg({ t: "你收藏的房源已下架", body: "「青泥洼桥 · 单间」已被商家下架，你可以看看相似房源。", time: "今天 09:12", unread: true })}
${msg({ t: "订单待商家确认", body: "订单 RH20261104001 已提交，商家将在 24 小时内确认。", time: "今天 08:40", unread: true })}
${msg({ t: "房源降价提醒", body: "「西安路 · 2室1厅」租金由 2,800 元调整为 2,650 元。", time: "昨天 18:02", unread: false })}
${msg({ t: "退款已到账", body: "订单 RH20260620011 的退款 6,205 元已原路退回（模拟）。", time: "2026-06-21", unread: false })}`;

/* ============================ 8 · 商家房源 ============================ */
const row = (r) => `
        <tr>
          <td><div class="t"><img src="${r.img}" alt=""><div><p>${r.t}</p><p class="m">${r.m}</p></div></div></td>
          <td><span class="tag ${r.cls}">${r.state}</span></td>
          <td class="num">${r.rent} 元/月</td>
          <td class="num">${r.view}</td>
          <td class="num">${r.fav}</td>
          <td>${r.time}</td>
          <td><button class="btn ghost sm">${r.act}</button></td>
        </tr>`;

const merchantListBody = `
      <div class="head">
        <div><h1>房源管理</h1></div>
        <div class="right"><a class="btn" href="merchant-edit.html" style="display:inline-flex;align-items:center;text-decoration:none">新建房源</a></div>
      </div>

      <div class="toolbar">
        <input type="search" placeholder="搜索房源标题或小区" aria-label="搜索房源">
        <select class="select-sm" aria-label="状态筛选"><option>全部状态</option><option>在架</option><option>已出租</option><option>已下架</option></select>
        <span class="grow"></span>
        <span class="note">5 套 · 在架 3 · 已出租 1 · 已下架 1</span>
      </div>

      <table class="table">
        <thead><tr><th>房源</th><th>状态</th><th class="num">租金</th><th class="num">浏览</th><th class="num">收藏</th><th>更新</th><th>操作</th></tr></thead>
        <tbody>
${[
  { img: P.l1, t: "星海广场 · 2室1厅", m: "沙河口 · 86㎡ · 南北", state: "在架", cls: "", rent: "3,200", view: 188, fav: 12, time: "3 天前", act: "下架" },
  { img: P.k1, t: "西安路 · 2室1厅", m: "沙河口 · 78㎡ · 朝南", state: "在架", cls: "", rent: "2,650", view: 142, fav: 9, time: "今天", act: "下架" },
  { img: P.b1, t: "和平广场 · 1室1厅", m: "沙河口 · 52㎡ · 朝南", state: "在架", cls: "", rent: "1,850", view: 96, fav: 5, time: "5 天前", act: "下架" },
  { img: P.l2, t: "软件园 · 2室2厅", m: "高新园区 · 98㎡ · 东南", state: "已出租", cls: "hue", rent: "4,100", view: 231, fav: 18, time: "8 天前", act: "查看订单" },
  { img: P.l3, t: "人民广场 · 3室2厅", m: "西岗 · 128㎡ · 南北", state: "已下架", cls: "plain", rent: "5,600", view: 45, fav: 2, time: "12 天前", act: "上架" },
].map(row).join("")}
        </tbody>
      </table>
      <p class="hint">房源处于「已出租」时不能改价，也不允许删除；只有下架状态可以编辑全部字段。</p>`;

/* ============================ 9 · 房源编辑 + AI ============================ */
const merchantEditBody = `
      <p class="crumbs"><a href="merchant-listings.html">房源管理</a><span>/</span>编辑房源</p>
      <div class="head">
        <div><h1>编辑房源</h1></div>
        <div class="right"><button class="btn ghost">保存草稿</button><button class="btn">保存并上架</button></div>
      </div>

      <div class="form">
        <div>
          <div class="fieldset">
            <h2>基本信息</h2>
            <div class="grid2">
              <div class="field wide"><label for="title">标题</label><input type="text" id="title" value="星海广场 · 2室1厅"></div>
              <div class="field"><label for="htype">房屋类型</label><select id="htype"><option>普通住宅</option><option>公寓</option></select></div>
              <div class="field"><label for="rtype">租赁类型</label><select id="rtype"><option>整租</option><option>合租/单间</option></select></div>
              <div class="field wide"><label for="desc">房源描述</label><textarea id="desc" rows="3">房子在星海广场东侧，步行到地铁 1 号线约 320 米。南北通透，主卧朝南，客厅带 3.6 米宽阳台。房东自住装修，家电齐全，可拎包入住。楼下有便利店与菜市场，小区 24 小时门禁。</textarea></div>
            </div>
          </div>

          <div class="fieldset">
            <h2>位置</h2>
            <div class="grid2">
              <div class="field"><label for="region">区域</label><select id="region"><option>沙河口</option><option>中山</option><option>西岗</option></select></div>
              <div class="field"><label for="comm">小区（选填）</label><input type="text" id="comm" value="星海广场"></div>
              <div class="field wide"><label for="addr">详细地址</label><input type="text" id="addr" value="沙河口区星海广场东路 6 号 3 单元 1402"></div>
              <div class="field"><label for="metro">地铁线路</label><select id="metro"><option>1 号线</option><option>2 号线</option><option>不近地铁</option></select></div>
              <div class="field"><label for="walk">步行距离</label><div class="with-unit"><input type="text" id="walk" value="320"><span class="unit">米</span></div></div>
            </div>
          </div>

          <div class="fieldset">
            <h2>户型与配套</h2>
            <div class="grid2">
              <div class="field"><label for="room">室 / 厅 / 卫</label><input type="text" id="room" value="2 / 1 / 1"></div>
              <div class="field"><label for="area">面积</label><div class="with-unit"><input type="text" id="area" value="86"><span class="unit">㎡</span></div></div>
              <div class="field"><label for="floor">楼层 / 总层</label><input type="text" id="floor" value="14 / 26"></div>
              <div class="field"><label for="ori">朝向</label><select id="ori"><option>南北</option><option>朝南</option><option>朝东</option></select></div>
              <div class="field"><label for="dec">装修</label><select id="dec"><option>精装</option><option>简装</option><option>豪装</option></select></div>
              <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" checked> 有电梯</label></div>
            </div>
            <div class="facrow">
              <span class="faclabel">卧室设施</span>
              <div class="chkrow">${FAC_BED.map(([id, name]) => `<label class="check"><input type="checkbox" checked> ${name}</label>`).join("")}</div>
            </div>
            <div class="facrow">
              <span class="faclabel">公共设施</span>
              <div class="chkrow">${FAC_PUB.map(([id, name]) => `<label class="check"><input type="checkbox" checked> ${name}</label>`).join("")}</div>
            </div>
          </div>

          <div class="fieldset">
            <h2>租金与租约</h2>
            <div class="grid2">
              <div class="field"><label for="rent">月租</label><div class="with-unit"><input type="text" id="rent" value="3200"><span class="unit">元/月</span></div></div>
              <div class="field"><label for="dep">押金</label><div class="with-unit"><input type="text" id="dep" value="3200"><span class="unit">元</span></div></div>
              <div class="field"><label for="avail">可入住日期</label><input type="date" id="avail" value="2026-12-01"></div>
              <div class="field"><label for="min">最短租期</label><select id="min"><option>6 个月</option><option>12 个月</option></select></div>
              <div class="field"><label for="pay">付款方式</label><select id="pay"><option>押一付三</option><option>押一付一</option><option>押一付六</option><option>年付</option></select></div>
              <div class="field"><label for="view">看房方式</label><select id="view"><option>随时可看</option><option>预约看房</option><option>仅周末</option></select></div>
              <div class="field wide"><label for="park">车位（选填）</label><input type="text" id="park" value="小区地下车库，另计"></div>
            </div>
          </div>

          <div class="fieldset">
            <h2>图片</h2>
            <p class="hint" style="margin:0 0 8px">已上传 8 张 · 首图为封面 · 单张不超过 5MB</p>
            <div class="shots" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
              <img src="${P.l1}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px">
              <img src="${P.k1}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px">
              <img src="${P.b1}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px">
              <div style="aspect-ratio:4/3;border:1px dashed var(--control);border-radius:6px;display:grid;place-items:center;color:var(--muted);font-size:13px">上传图片</div>
            </div>
          </div>
        </div>

        <aside class="drawer">
          <div class="dh"><b>AI 辅助</b><span class="close">收起</span></div>
          <div class="dbody">
            <p style="margin:0;font-size:12px;color:var(--muted)">参考价 · 沙河口 × 二室 × 60–90㎡</p>
            <p class="range-big">2,900 – 3,400 元</p>
            <p class="range-note">样本 24 套 · 中位数 3,150 元 · 你的定价 3,200 元处于区间内</p>

            <div style="margin-top:14px">
              <div class="peer"><span>星海广场 · 86㎡ · 精装</span><b>3,300</b></div>
              <div class="peer"><span>西安路 · 82㎡ · 精装</span><b>3,050</b></div>
              <div class="peer"><span>马栏广场 · 74㎡ · 简装</span><b>2,600</b></div>
            </div>

            <p class="why">同区域同户型近 30 天在架的 24 套里，精装两居集中在 2,900–3,400 元；你这套带电梯且距地铁 320 米，定价可以在区间上半段。</p>
            <div class="actions">
              <button class="btn">填入 3,200</button>
              <button class="btn ghost">忽略</button>
            </div>

            <hr style="border:0;border-top:1px solid var(--rule);margin:16px 0">
            <p style="margin:0 0 8px;font-size:12px;color:var(--muted)">文案候选（标题）</p>
            <div class="peer"><span>星海广场精装两居 近地铁带阳台</span><b>选用</b></div>
            <div class="peer"><span>沙河口 86㎡ 南北通透 拎包入住</span><span>备用</span></div>
            <p class="why">候选文案只引用了已填字段；未填写的「学区」「宠物」不会被写入。</p>
          </div>
        </aside>
      </div>`;

/* ============================ 10 · 商家订单 ============================ */
const merchantOrdersBody = `
      <h1>订单管理</h1>
      
      <nav class="tabs">
        <a href="#" class="on">待确认 <span class="n">2</span></a>
        <a href="#">已确认 <span class="n">1</span></a>
        <a href="#">已完成 <span class="n">8</span></a>
        <a href="#">已拒绝 <span class="n">0</span></a>
      </nav>
      <table class="table">
        <thead><tr><th>订单与房源</th><th>租客</th><th>租期</th><th class="num">金额</th><th>提交时间</th><th>操作</th></tr></thead>
        <tbody>
          <tr>
            <td><div class="t"><img src="${P.l1}" alt=""><div><p>RH20261104001</p><p class="m">星海广场 · 2室1厅</p></div></div></td>
            <td>王俊锡<p class="m">138 **** 6621</p></td>
            <td>12 个月<p class="m">2026-12-01 入住</p></td>
            <td class="num">41,760</td>
            <td>今天 10:22</td>
            <td><button class="btn sm">接单</button> <button class="btn ghost sm">拒单</button></td>
          </tr>
          <tr>
            <td><div class="t"><img src="${P.k1}" alt=""><div><p>RH20261104002</p><p class="m">西安路 · 2室1厅</p></div></div></td>
            <td>李梦<p class="m">139 **** 2180</p></td>
            <td>6 个月<p class="m">2026-11-15 入住</p></td>
            <td class="num">16,695</td>
            <td>今天 09:05</td>
            <td><button class="btn sm">接单</button> <button class="btn ghost sm">拒单</button></td>
          </tr>
          <tr>
            <td><div class="t"><img src="${P.l2}" alt=""><div><p>RH20261028007</p><p class="m">软件园 · 2室2厅</p></div></div></td>
            <td>张三<p class="m">137 **** 9042</p></td>
            <td>6 个月<p class="m">2026-11-20 入住</p></td>
            <td class="num">28,905</td>
            <td>10-28 19:40</td>
            <td><button class="btn ghost sm">标记完成</button></td>
          </tr>
        </tbody>
      </table>
      <p class="hint">接单后房源自动置为「已出租」；拒单需填写原因，系统会释放房源并生成退款流水。</p>`;

/* ============================ 11 · 资质审核 ============================ */
const adminReviewBody = `
      <h1>资质审核</h1>
      
      <div class="split">
        <div>
          <table class="table">
            <thead><tr><th>商家</th><th>提交时间</th><th>材料</th><th>状态</th></tr></thead>
            <tbody>
              <tr aria-current="true" style="background:#fafaf9">
                <td><p>星辰公寓</p><p class="m">沙河口 · 12 套在架申请</p></td>
                <td>今天 09:40</td>
                <td>2 张</td>
                <td><span class="tag warn">待审核</span></td>
              </tr>
              <tr>
                <td><p>海滨小屋</p><p class="m">中山 · 3 套在架申请</p></td>
                <td>昨天 16:12</td>
                <td>3 张</td>
                <td><span class="tag warn">待审核</span></td>
              </tr>
              <tr>
                <td><p>高新区合租</p><p class="m">高新园区 · 6 套</p></td>
                <td>10-30 11:20</td>
                <td>1 张</td>
                <td><span class="tag">已通过</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <aside class="review-panel">
          <h2>星辰公寓</h2>
          <p class="muted-line">营业执照 · 法人身份证 · 提交于 2026-11-04 09:40</p>
          <div class="shots"><img src="${P.bd}" alt="营业执照材料，演示图片"><img src="${P.l4}" alt="经营场所材料，演示图片"></div>
          <div class="field"><label for="reason">驳回原因（通过时可不填）</label><textarea id="reason" rows="3" placeholder="不少于 10 字，说明需要补正的材料"></textarea></div>
          <div class="actions" style="display:flex;gap:8px;margin-top:12px">
            <button class="btn" style="flex:1">通过并解锁上架</button>
            <button class="btn ghost" style="flex:1">驳回</button>
          </div>
          <p class="hint">通过后商家立即可以上架房源，并会收到一条站内通知。</p>
        </aside>
      </div>`;

/* ============================ 12 · 个人信息 ============================ */
const profileBody = `
      <h1>个人信息</h1>
      <div class="form">
        <div>
          <div class="fieldset">
            <h2>账号</h2>
            <div class="grid2">
              <div class="field"><label for="nick">昵称</label><input type="text" id="nick" value="肖福晟"></div>
              <div class="field"><label for="acct">账号</label><input type="text" id="acct" value="xiaofs" disabled></div>
              <div class="field"><label for="phone2">手机号</label><input type="text" id="phone2" value="138 **** 6621" disabled></div>
              <div class="field"><label for="reg">注册时间</label><input type="text" id="reg" value="2026-09-12" disabled></div>
            </div>
          </div>
          <div class="fieldset">
            <h2>登录密码</h2>
            <div class="grid2">
              <div class="field"><label for="old">当前密码</label><input type="password" id="old" value="········"></div>
              <div class="field"><label for="new">新密码</label><input type="password" id="new" placeholder="8~20 位，含字母与数字"></div>
            </div>
            <p class="hint">修改后其它设备上的登录会自动失效。</p>
          </div>
        </div>
        <aside class="summary">
          <h2>资料完整度</h2>
          <div class="row"><span>昵称</span><b>已填写</b></div>
          <div class="row"><span>头像</span><b>未上传</b></div>
          <div class="row"><span>实名信息</span><b>未填写</b></div>
          <div class="total"><span>完整度</span><b>40%</b></div>
          <button class="btn">保存修改</button>
          <p class="fine">演示环境不校验真实身份信息。</p>
        </aside>
      </div>`;

/* ============================ 13 · 商家信息与资质 ============================ */
const merchantProfileBody = `
      <h1>商家信息与资质</h1>
      <div class="form">
        <div>
          <div class="fieldset">
            <h2>店铺信息</h2>
            <div class="grid2">
              <div class="field"><label for="shop">店铺名称</label><input type="text" id="shop" value="星辰公寓"></div>
              <div class="field"><label for="tel">联系电话</label><input type="text" id="tel" value="0411-8888 6621"></div>
              <div class="field wide"><label for="intro">店铺简介</label><textarea id="intro" rows="3">沙河口与高新园区整租为主，房源均为自持或独家代理，支持随时看房。</textarea></div>
            </div>
          </div>

          <div class="fieldset">
            <h2>资质材料</h2>
            <p class="hint" style="margin:0 0 10px">营业执照 · 法人身份证 · 已上传 2 张 · 支持 jpg/png，单张不超过 5MB</p>
            <div class="shots" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
              <img src="${P.bd}" alt="营业执照材料，演示图片" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px">
              <img src="${P.l4}" alt="法人身份材料，演示图片" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px">
              <div style="aspect-ratio:4/3;border:1px dashed var(--control);border-radius:6px;display:grid;place-items:center;color:var(--muted);font-size:13px">上传新材料</div>
            </div>
          </div>

          <div class="fieldset">
            <h2>审核记录</h2>
            <table class="table">
              <thead><tr><th>时间</th><th>动作</th><th>材料</th><th>结果</th></tr></thead>
              <tbody>
                <tr><td>2026-10-28 14:02</td><td>管理员审核</td><td>2 张</td><td><span class="tag">通过</span></td></tr>
                <tr><td>2026-10-26 09:40</td><td>提交资质</td><td>2 张</td><td><span class="tag plain">待审核</span></td></tr>
                <tr><td>2026-09-30 11:15</td><td>首次驳回</td><td>1 张</td><td><span class="tag warn">缺法人身份证</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <aside class="summary">
          <h2>资质状态</h2>
          <p style="margin:0 0 12px"><span class="tag">已通过</span></p>
          <div class="row"><span>最近提交</span><b>2026-10-26</b></div>
          <div class="row"><span>审核时间</span><b>2026-10-28</b></div>
          <div class="row"><span>审核人</span><b>管理员</b></div>
          <div class="row"><span>可上架房源</span><b>5 套</b></div>
          <button class="btn">保存店铺信息</button>
          <button class="btn ghost" style="width:100%;margin-top:8px">重新提交资质</button>
          <p class="fine">资质通过后才能上架房源；更新材料后需重新审核，期间在架房源不受影响。</p>
        </aside>
      </div>`;

/* ============================ 14 · 登录 / 注册 ============================ */
const authShell = (title, body) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · 栖居 RentHub</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="auth">
    <aside class="auth-art">
      <img src="${A}modern-living-room-with-stylish-furniture-and.jpg" alt="房源实拍，演示图片">
      <div class="auth-art-in">
        <a class="brand" href="login.html">栖居<span class="brand-en">RentHub</span></a>
        <p class="tagline">在大连，找到下一年住的地方</p>
      </div>
    </aside>
    <main class="auth-main">
      <div class="auth-box">
${body}
      </div>
      <p class="auth-foot">栖居 RentHub · 软件工程综合实训 · 全部数据为教学演示</p>
    </main>
  </div>
  <script src="app.js"></script>
</body>
</html>`;

const loginBody = `
        <h1>登录</h1>

        <div class="role-switch" role="tablist" aria-label="登录入口">
          <button class="on" role="tab" aria-selected="true">租客</button>
          <button role="tab" aria-selected="false">商家</button>
          <button role="tab" aria-selected="false">管理员</button>
        </div>

        <div class="alert" id="alert" hidden></div>

        <form class="auth-fields" onsubmit="return false">
          <div class="field"><label for="acct">账号</label>
            <input type="text" id="acct" placeholder="4~20 位字母或数字" autocomplete="username"></div>
          <div class="field"><label for="pwd">密码</label>
            <input type="password" id="pwd" placeholder="8~20 位，含字母与数字" autocomplete="current-password"></div>
          <div class="auth-row">
            <label class="check"><input type="checkbox"> 7 天内记住我</label>
            <a href="#">忘记密码？</a>
          </div>
          <button class="btn auth-btn" type="submit">登录</button>
        </form>

        <p class="auth-alt">还没有账号？<a href="register.html">立即注册</a></p>
        <p class="demo-states">原型演示：<a href="#" data-state="badpwd">密码错误</a><span>·</span><a href="#" data-state="wrongrole">入口不符</a><span>·</span><a href="#" data-state="locked">账号锁定</a></p>`;

const registerBody = `
        <h1>注册</h1>

        <div class="role-switch two" role="tablist" aria-label="注册身份">
          <button class="on" role="tab" aria-selected="true">租客</button>
          <button role="tab" aria-selected="false">商家</button>
        </div>

        <form class="auth-fields" onsubmit="return false">
          <div class="field"><label for="acct2">账号</label>
            <input type="text" id="acct2" placeholder="4~20 位字母或数字"></div>
          <div class="field"><label for="pwd2">密码</label>
            <input type="password" id="pwd2" placeholder="8~20 位，含字母与数字"></div>
          <div class="field"><label for="pwd3">确认密码</label>
            <input type="password" id="pwd3" placeholder="再输入一次"></div>
          <button class="btn auth-btn" type="submit">注册并进入</button>
        </form>

        <p class="auth-alt">已有账号？<a href="login.html">去登录</a></p>
        <p class="hint">昵称由系统随机生成，注册后可在「个人信息」里修改；注册商家后需要先提交资质，通过后才能上架房源。</p>`;

/* ============================ write ============================ */
const pages = [
  ["index.html", shell("tenant", "index.html", { title: "找房", body: listBody })],
  ["detail.html", shell("tenant", "index.html", { title: "房源详情", body: detailBody })],
  ["agent.html", shell("tenant", "index.html", { title: "AI 找房", body: agentBody })],
  ["booking.html", shell("tenant", "index.html", { title: "确认订单", body: bookingBody, pageClass: "narrow" })],
  ["orders.html", shell("tenant", "orders.html", { title: "我的订单", body: ordersBody })],
  ["favorites.html", shell("tenant", "favorites.html", { title: "我的收藏", body: favoritesBody })],
  ["messages.html", shell("tenant", "messages.html", { title: "通知中心", body: messagesBody })],
  ["profile.html", shell("tenant", "profile.html", { title: "个人信息", body: profileBody, pageClass: "narrow" })],
  ["login.html", authShell("登录", loginBody)],
  ["register.html", authShell("注册", registerBody)],
  ["merchant-listings.html", shell("merchant", "merchant-listings.html", { title: "房源管理", body: merchantListBody })],
  ["merchant-edit.html", shell("merchant", "merchant-listings.html", { title: "编辑房源", body: merchantEditBody })],
  ["merchant-orders.html", shell("merchant", "merchant-orders.html", { title: "订单管理", body: merchantOrdersBody })],
  ["merchant-profile.html", shell("merchant", "merchant-profile.html", { title: "商家信息与资质", body: merchantProfileBody })],
  ["admin-review.html", shell("admin", "admin-review.html", { title: "资质审核", body: adminReviewBody })],
];

for (const [name, html] of pages) fs.writeFileSync(path.join(OUT, name), html, "utf8");
console.log(`built ${pages.length} pages → ${path.relative(process.cwd(), OUT) || '.'}`);
