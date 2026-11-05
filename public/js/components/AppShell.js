/**
 * 公共头 + 页面容器 + 页脚
 *
 * 结构与 v2 的 shell() 完全一致（.topbar / .sheet / .page / .foot），
 * 只是把「服务端渲染出来的 15 份 HTML」改成「一份布局组件 + 路由出口」。
 */
import { ref, computed, watch, onMounted, onUnmounted, useRoute, useRouter } from '../lib.js';
import { state, logout, toast, ROLE_LABEL } from '../store.js';

/** 菜单定义：与 v2 ROLES 完全一致 */
const ROLES = {
  tenant: {
    links: [{ to: '/', text: '找房' }],
    menu: [
      { to: '/favorites', text: '我的收藏', count: 'favorites' },
      { to: '/orders', text: '我的订单', count: 'orders' },
      { to: '/messages', text: '通知中心', count: 'messages' },
      { to: '/profile', text: '个人信息', count: null },
    ],
  },
  merchant: {
    links: [
      { to: '/merchant/listings', text: '房源管理' },
      { to: '/merchant/orders', text: '订单管理' },
    ],
    menu: [
      { to: '/merchant/listings', text: '我的房源', count: 'mHouses' },
      { to: '/merchant/orders', text: '订单管理', count: 'mPending' },
      { to: '/merchant/profile', text: '商家信息与资质', count: null },
    ],
  },
  admin: {
    links: [{ to: '/admin/review', text: '资质审核' }],
    menu: [
      { to: '/admin/review', text: '资质审核', count: 'reviews' },
      { to: '#', text: '用户管理', count: null },
      { to: '#', text: '房源管理', count: null },
      { to: '#', text: '订单查看', count: null },
    ],
  },
};

/** 原型演示：切换端（与 v2 DEMO 表一致） */
const DEMO = {
  tenant: [{ to: '/merchant/listings', text: '商家端' }, { to: '/admin/review', text: '管理员端' }],
  merchant: [{ to: '/', text: '租客端' }, { to: '/admin/review', text: '管理员端' }],
  admin: [{ to: '/', text: '租客端' }, { to: '/merchant/listings', text: '商家端' }],
};

export default {
  name: 'AppShell',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const open = ref(false);

    /* 访客（未登录）沿用租客的头部结构，只是账号区显示「登录 / 注册」 */
    const roleKey = computed(() => (state.me?.role && ROLES[state.me.role] ? state.me.role : 'tenant'));
    const conf = computed(() => ROLES[roleKey.value]);

    const displayName = computed(() => state.me?.nickname || '登录 / 注册');
    const displayInitial = computed(() => state.me?.initial || '登');

    const demoLinks = computed(() => DEMO[state.me?.role || 'tenant'] || DEMO.tenant);

    const counts = computed(() => {
      const c = state.counts || {};
      const m = state.merchantCounts || {};
      return {
        favorites: c.favorites || 0,
        orders: c.orders || 0,
        messages: c.messages || 0,
        mPending: m.pending || 0,
        mHouses: state.merchantHouses ?? null,
        reviews: state.adminPending ?? null,
      };
    });
    const menuLinkAttrs = (item) => ({ 'aria-current': isActive(item.to) ? 'page' : null });
    const menuBadge = (item) => {
      if (!item.count) return null;
      const n = counts.value[item.count];
      return n ? n : null;
    };

    const isActive = (to) => {
      if (!to || to === '#') return false;
      if (to === '/') return route.path === '/';
      return route.path === to || route.path.startsWith(to + '/');
    };

    const closeMenu = () => { open.value = false; };
    const onDocClick = (e) => {
      if (!open.value) return;
      const el = e.target;
      if (el && el.closest && el.closest('.account')) return;
      closeMenu();
    };
    const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };

    onMounted(() => {
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onKey);
    });
    onUnmounted(() => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    });

    watch(() => route.fullPath, closeMenu);

    const doLogout = async () => {
      closeMenu();
      await logout();
      toast('已退出登录', 'ok');
      router.push('/login');
    };

    const goDemo = (to) => {
      closeMenu();
      router.push(to);
    };

    return {
      state, conf, displayName, displayInitial, demoLinks, open, isActive,
      menuLinkAttrs, menuBadge, closeMenu, doLogout, goDemo, route,
      roleLabel: ROLE_LABEL,
    };
  },
  template: `
  <header class="topbar">
    <RouterLink class="brand" to="/">栖居<span class="brand-en">RentHub</span></RouterLink>
    <button class="city" type="button">大连<span class="chev">▾</span></button>
    <nav class="links">
      <RouterLink v-for="l in conf.links" :key="l.to" :to="l.to" :aria-current="isActive(l.to) ? 'page' : null">{{ l.text }}</RouterLink>
    </nav>
    <div class="account">
      <button class="avatar-btn" aria-haspopup="menu" :aria-expanded="open ? 'true' : 'false'" @click.stop="open = !open">
        <span class="avatar">{{ displayInitial }}</span><span class="uname">{{ displayName }}</span><span class="chev">▾</span>
      </button>
      <div class="menu" role="menu" v-show="open">
        <template v-if="state.me">
          <RouterLink v-for="m in conf.menu" :key="m.text" :to="m.to" role="menuitem" v-bind="menuLinkAttrs(m)">
            {{ m.text }}<span class="badge" v-if="menuBadge(m)">{{ menuBadge(m) }}</span>
          </RouterLink>
        </template>
        <template v-else>
          <RouterLink to="/login" role="menuitem">登录</RouterLink>
          <RouterLink to="/register" role="menuitem">注册</RouterLink>
        </template>
        <hr>
        <p class="menu-label">原型演示：切换端</p>
        <a v-for="d in demoLinks" :key="d.to" role="menuitem" href="#" @click.prevent="goDemo(d.to)">{{ d.text }}</a>
        <hr>
        <a role="menuitem" href="/login" @click.prevent="doLogout">退出登录</a>
      </div>
    </div>
  </header>
  <div class="sheet">
    <div class="page" :class="{ narrow: route.meta.narrow }">
      <slot></slot>
      <footer class="foot">
        <span>栖居 RentHub · 大连 · 教学演示数据</span>
        <span>演示图片来自 Wikimedia Commons（CC0 / CC BY 2.0 / CC BY-SA 4.0），出处见 credits.json</span>
      </footer>
    </div>
  </div>
  `,
};
