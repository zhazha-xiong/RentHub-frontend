const acct = document.getElementById('acct');
const menu = document.getElementById('menu');
if (acct && menu) {
  acct.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = acct.getAttribute('aria-expanded') === 'true';
    acct.setAttribute('aria-expanded', String(!open));
    menu.hidden = open;
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target)) {
      acct.setAttribute('aria-expanded', 'false');
      menu.hidden = true;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { acct.setAttribute('aria-expanded', 'false'); menu.hidden = true; }
  });
}

document.querySelectorAll('.mode').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
    });
    const region = document.getElementById('f-region');
    const metro = document.getElementById('f-metro');
    if (region && metro) {
      const isRegion = btn.dataset.mode === 'region';
      region.hidden = !isRegion;
      metro.hidden = isRegion;
    }
  });
});

// 选择框：点击即作为一条用户消息发送（选项本身就是一句完整的话）
const thread = document.getElementById('thread');
if (thread) {
  // 历史轮次的选择框：已作答，置灰不可再点
  const groups = [...document.querySelectorAll('.q')];
  groups.slice(0, -1).forEach((g) => g.classList.add('done'));
  groups.forEach((g) => g.querySelectorAll('button').forEach((b) => {
    if (g.classList.contains('done')) b.setAttribute('aria-disabled', 'true');
  }));

  document.querySelectorAll('.q button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.getAttribute('aria-disabled') === 'true') return;
      const text = btn.textContent.replace(/\s*·\s*\d+\s*套$/, '').trim();
      const wrap = document.createElement('div');
      wrap.className = 'msg user';
      const who = document.createElement('p');
      who.className = 'who';
      who.innerHTML = '<span class="ava-u">肖</span>';
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = text;
      wrap.append(who, bubble);
      thread.appendChild(wrap);
      const group = btn.closest('.q');
      if (group) group.style.display = 'none';
      document.querySelectorAll('.q').forEach((g) => {
        g.classList.add('done');
        g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-disabled', 'true'));
      });
      wrap.scrollIntoView({ block: 'nearest' });
    });
  });
}

// 图集缩略图切换
const thumbs = document.querySelectorAll('.thumbs .th');
const stageImg = document.querySelector('.stage img');
const counter = document.querySelector('.stage .counter');
if (thumbs.length && stageImg) {
  thumbs.forEach((th, i) => {
    th.addEventListener('click', () => {
      const img = th.querySelector('img');
      if (!img) return;
      thumbs.forEach((x) => x.classList.remove('on'));
      th.classList.add('on');
      stageImg.src = img.src;
      if (counter) counter.textContent = (i + 1) + ' / 12';
    });
  });
}

// 登录页异常态（点击下方演示链接，或 URL 带 ?state=）
const alertBox = document.getElementById('alert');
function applyLoginState(st) {
  if (!alertBox) return;
  const map = {
    badpwd: { cls: '', text: '账号或密码不正确。你还可以再试 4 次，超过 5 次该账号会被锁定 15 分钟。' },
    wrongrole: { cls: 'warn', text: '该账号是商家账号，请从上方「商家」入口登录。' },
    locked: { cls: '', text: '连续 5 次密码错误，账号已锁定 15 分钟。14:32 之后可重试，或联系管理员解锁。' }
  };
  if (!map[st]) return;
  alertBox.textContent = map[st].text;
  alertBox.className = 'alert ' + map[st].cls;
  alertBox.hidden = false;
  document.querySelectorAll('.role-switch button').forEach((t, i) => {
    const on = st === 'wrongrole' ? i === 1 : i === 0;
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', String(on));
  });
  const btn = document.querySelector('.auth-btn');
  document.querySelectorAll('.auth-fields input').forEach((el) => {
    if (st === 'locked') el.disabled = true;
  });
  if (btn && st === 'locked') { btn.disabled = true; btn.textContent = '已锁定，稍后再试'; }
}
if (alertBox) {
  const st = new URLSearchParams(location.search).get('state');
  if (st) applyLoginState(st);
  document.querySelectorAll('.demo-states a').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); applyLoginState(a.dataset.state); });
  });
  window.__loginState = applyLoginState;
}
