import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import type { Role } from '@/api/types'
import { onUnauthorized } from '@/api/token'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    requiresAuth?: boolean
    roles?: Role[]
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      { path: '', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: '找房' } },
      { path: 'listings/:id', name: 'listing-detail', component: () => import('@/views/ListingDetailView.vue'), meta: { title: '房源详情' } },
      { path: 'ai', name: 'ai-chat', component: () => import('@/views/AiChatView.vue'), meta: { title: 'AI 找房' } },
      {
        path: 'booking/:id',
        name: 'booking',
        component: () => import('@/views/BookingView.vue'),
        meta: { title: '确认订单', requiresAuth: true, roles: ['tenant'] },
      },
      {
        path: 'favorites',
        name: 'favorites',
        component: () => import('@/views/FavoritesView.vue'),
        meta: { title: '我的收藏', requiresAuth: true, roles: ['tenant'] },
      },
      {
        path: 'orders',
        name: 'orders',
        component: () => import('@/views/OrdersView.vue'),
        meta: { title: '我的订单', requiresAuth: true, roles: ['tenant', 'merchant'] },
      },
      { path: 'orders/:id', name: 'order-detail', component: () => import('@/views/OrderDetailView.vue'), meta: { title: '订单详情', requiresAuth: true } },
      {
        path: 'notifications',
        name: 'notifications',
        component: () => import('@/views/NotificationsView.vue'),
        meta: { title: '通知中心', requiresAuth: true },
      },
      { path: 'me', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: { title: '个人信息', requiresAuth: true } },

      {
        path: 'merchant/listings',
        name: 'merchant-listings',
        component: () => import('@/views/merchant/MerchantListingsView.vue'),
        meta: { title: '房源管理', requiresAuth: true, roles: ['merchant'] },
      },
      {
        path: 'merchant/listings/new',
        name: 'merchant-listing-new',
        component: () => import('@/views/merchant/MerchantListingEditView.vue'),
        meta: { title: '新建房源', requiresAuth: true, roles: ['merchant'] },
      },
      {
        path: 'merchant/listings/:id/edit',
        name: 'merchant-listing-edit',
        component: () => import('@/views/merchant/MerchantListingEditView.vue'),
        meta: { title: '编辑房源', requiresAuth: true, roles: ['merchant'] },
      },
      {
        path: 'merchant/orders',
        name: 'merchant-orders',
        component: () => import('@/views/merchant/MerchantOrdersView.vue'),
        meta: { title: '订单管理', requiresAuth: true, roles: ['merchant'] },
      },
      {
        path: 'merchant/qualification',
        name: 'merchant-qualification',
        component: () => import('@/views/merchant/MerchantQualificationView.vue'),
        meta: { title: '商家资质', requiresAuth: true, roles: ['merchant'] },
      },

      {
        path: 'admin/qualifications',
        name: 'admin-qualifications',
        component: () => import('@/views/admin/AdminQualificationsView.vue'),
        meta: { title: '资质审核', requiresAuth: true, roles: ['admin'] },
      },
      {
        path: 'admin/listings',
        name: 'admin-listings',
        component: () => import('@/views/admin/AdminListingsView.vue'),
        meta: { title: '房源处置', requiresAuth: true, roles: ['admin'] },
      },
      {
        path: 'admin/users',
        name: 'admin-users',
        component: () => import('@/views/admin/AdminUsersView.vue'),
        meta: { title: '用户管理', requiresAuth: true, roles: ['admin'] },
      },
    ],
  },
  /* 登录 / 注册：独立布局（对齐旧版 authShell，不带顶栏） */
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { title: '登录' } },
  { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue'), meta: { title: '注册' } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue'), meta: { title: '页面不存在' } },
]

export const router = createRouter({
  history: createWebHistory('/'),
  routes,
  scrollBehavior(_to, _from, saved) {
    return saved ?? { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.bootstrap()

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  const roles = to.meta.roles
  if (roles?.length && auth.isLoggedIn && !roles.includes(auth.role as Role)) {
    return auth.HOME_BY_ROLE[auth.role] ?? '/'
  }
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 栖居 RentHub` : '栖居 RentHub'
})

/* 中间层刷新令牌失败时统一回登录页（避免每个页面各写一遍） */
onUnauthorized(() => {
  const current = router.currentRoute.value
  if (current.name === 'login') return
  void router.push({ path: '/login', query: { redirect: current.fullPath } })
})
