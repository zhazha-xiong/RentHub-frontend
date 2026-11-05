/**
 * 路由表 + 导航守卫
 *
 * 采用 History 模式（URL 干净、可直接分享），服务端已做 SPA fallback。
 *
 * 「减少非法用户通过链接访问」的两道门：
 *   1) 这里 —— 未登录/角色不符直接拦下来，URL 打不开页面；
 *   2) 服务端 —— 所有 /api 保护接口都校验 session + 角色（见 server/session.mjs）。
 * 只做第 1 道是不够的：localStorage 可以手改，session 不能。
 */
import {
  createRouter, createWebHistory,
} from './lib.js';
import { state, bootstrap, readPos, savePos, toast, HOME_BY_ROLE, ROLE_LABEL } from './store.js';

import HomeView from './views/HomeView.js';
import DetailView from './views/DetailView.js';
import AgentView from './views/AgentView.js';
import BookingView from './views/BookingView.js';
import OrdersView from './views/OrdersView.js';
import FavoritesView from './views/FavoritesView.js';
import MessagesView from './views/MessagesView.js';
import ProfileView from './views/ProfileView.js';
import LoginView from './views/LoginView.js';
import RegisterView from './views/RegisterView.js';
import NotFoundView from './views/NotFoundView.js';

import MerchantListings from './views/merchant/MerchantListings.js';
import MerchantEdit from './views/merchant/MerchantEdit.js';
import MerchantOrders from './views/merchant/MerchantOrders.js';
import MerchantProfile from './views/merchant/MerchantProfile.js';
import AdminReview from './views/admin/AdminReview.js';

/** 公开页面：不登录也能看（列表、详情、AI、登录注册） */
const routes = [
  { path: '/', name: 'home', component: HomeView, meta: { title: '找房', nav: '/' } },
  { path: '/house/:id', name: 'detail', component: DetailView, meta: { title: '房源详情', nav: '/' } },
  { path: '/agent', name: 'agent', component: AgentView, meta: { title: 'AI 找房', nav: '/' } },

  /* 需要租客身份 */
  { path: '/booking/:id', name: 'booking', component: BookingView, meta: { title: '确认订单', roles: ['tenant'], narrow: true, nav: '/' } },
  { path: '/orders', name: 'orders', component: OrdersView, meta: { title: '我的订单', roles: ['tenant'], nav: '/orders' } },
  { path: '/favorites', name: 'favorites', component: FavoritesView, meta: { title: '我的收藏', roles: ['tenant'], nav: '/favorites' } },
  { path: '/messages', name: 'messages', component: MessagesView, meta: { title: '通知中心', roles: ['tenant'], nav: '/messages' } },
  { path: '/profile', name: 'profile', component: ProfileView, meta: { title: '个人信息', roles: ['tenant'], narrow: true, nav: '/profile' } },

  /* 登录 / 注册：独立布局、独立 URL */
  { path: '/login', name: 'login', component: LoginView, meta: { title: '登录', layout: 'auth' } },
  { path: '/register', name: 'register', component: RegisterView, meta: { title: '注册', layout: 'auth' } },

  /* 商家端：独立 URL 前缀 /merchant/* */
  { path: '/merchant/listings', name: 'merchant-listings', component: MerchantListings, meta: { title: '房源管理', roles: ['merchant'], nav: '/merchant/listings' } },
  { path: '/merchant/houses/:id/edit', name: 'merchant-edit', component: MerchantEdit, meta: { title: '编辑房源', roles: ['merchant'], nav: '/merchant/listings' } },
  { path: '/merchant/orders', name: 'merchant-orders', component: MerchantOrders, meta: { title: '订单管理', roles: ['merchant'], nav: '/merchant/orders' } },
  { path: '/merchant/profile', name: 'merchant-profile', component: MerchantProfile, meta: { title: '商家信息与资质', roles: ['merchant'], nav: '/merchant/profile' } },

  /* 管理员端：独立 URL 前缀 /admin/* */
  { path: '/admin/review', name: 'admin-review', component: AdminReview, meta: { title: '资质审核', roles: ['admin'], nav: '/admin/review' } },

  { path: '/:pathMatch(.*)*', name: 'notfound', component: NotFoundView, meta: { title: '页面不存在' } },
];

export const router = createRouter({
  history: createWebHistory('/'),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    const y = readPos(to.fullPath);
    if (y > 0) {
      /* 返回列表/详情时恢复浏览位置；图片尚未撑开高度就多试几次 */
      return new Promise((resolve) => {
        const tries = [0, 80, 240, 600, 1000];
        let i = 0;
        const next = () => {
          if (i >= tries.length) return resolve({ top: y });
          const delay = tries[i++];
          setTimeout(() => {
            window.scrollTo(0, y);
            if (Math.abs(window.scrollY - y) < 2) resolve({ top: y });
            else next();
          }, delay);
        };
        next();
      });
    }
    return { top: 0, left: 0 };
  },
});

/* ---------------- 守卫 ---------------- */
router.beforeEach(async (to) => {
  if (!state.booted) await bootstrap();

  const need = to.meta.roles;
  if (!need || !need.length) return true;

  if (!state.me) {
    return { path: '/login', query: { role: need[0], from: to.fullPath } };
  }

  if (!need.includes(state.me.role)) {
    const label = ROLE_LABEL[state.me.role] || '当前账号';
    toast(`${label}无权访问该页面（角色不符）`, 'warn');
    return HOME_BY_ROLE[state.me.role] || '/';
  }

  return true;
});

router.afterEach((to) => {
  document.title = `${to.meta.title ? `${to.meta.title} · ` : ''}栖居 RentHub`;
});

/* ---------------- 滚动位置记录 ---------------- */
export function startScrollTracker() {
  let raf = null;
  window.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      savePos(router.currentRoute.value.fullPath, window.scrollY);
    });
  }, { passive: true });
  /* 离开页面前再存一次：路由已经切走时 scrollY 不可靠，所以用 beforeunload 兜住刷新 */
  window.addEventListener('beforeunload', () => {
    savePos(router.currentRoute.value.fullPath, window.scrollY);
  });
}
