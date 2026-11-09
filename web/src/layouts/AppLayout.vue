<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

/** 顶栏导航：按角色给菜单（访客看公开页） */
const menus = computed(() => {
  if (auth.isMerchant) {
    return [
      { key: 'merchant-listings', label: '房源管理', to: '/merchant/listings' },
      { key: 'merchant-orders', label: '订单管理', to: '/merchant/orders' },
      { key: 'merchant-qualification', label: '商家资质', to: '/merchant/qualification' },
    ]
  }
  if (auth.isAdmin) {
    return [
      { key: 'admin-qualifications', label: '资质审核', to: '/admin/qualifications' },
      { key: 'admin-listings', label: '房源处置', to: '/admin/listings' },
      { key: 'admin-users', label: '用户管理', to: '/admin/users' },
    ]
  }
  const base = [
    { key: 'home', label: '找房', to: '/' },
    { key: 'ai-chat', label: 'AI 找房', to: '/ai' },
  ]
  if (auth.isLoggedIn) {
    base.push(
      { key: 'favorites', label: '我的收藏', to: '/favorites' },
      { key: 'orders', label: '我的订单', to: '/orders' },
    )
  }
  return base
})

const selectedKeys = computed(() => {
  const name = String(route.name ?? '')
  if (name === 'home') return ['home']
  if (name === 'listing-detail') return ['home']
  return [name]
})

const userMenu = computed(() => {
  const items: { key: string; label: string }[] = [
    { key: 'profile', label: '个人信息' },
    { key: 'notifications', label: '通知中心' },
  ]
  if (auth.isMerchant) items.push({ key: 'merchant-listings', label: '房源管理' })
  if (auth.isAdmin) items.push({ key: 'admin-qualifications', label: '资质审核' })
  items.push({ key: 'logout', label: '退出登录' })
  return items
})

function goto(to: string) {
  void router.push(to)
}

function onMenuClick(info: { key: string | number }) {
  const target = menus.value.find((m) => m.key === String(info.key))
  if (target) goto(target.to)
}

async function onUserMenuClick(info: { key: string | number }) {
  const key = String(info.key)
  if (key === 'logout') {
    await auth.logout()
    message.success('已退出登录')
    void router.push('/login')
    return
  }
  const map: Record<string, string> = {
    profile: '/me',
    notifications: '/notifications',
    'merchant-listings': '/merchant/listings',
    'admin-qualifications': '/admin/qualifications',
  }
  if (map[key]) goto(map[key])
}
</script>

<template>
  <a-layout style="min-height: 100vh">
    <a-layout-header
      style="
        position: sticky;
        top: 0;
        z-index: 20;
        padding: 0;
        border-bottom: 1px solid var(--rh-border);
        background: #fff;
      "
    >
      <div class="rh-container" style="display: flex; align-items: center; gap: 20px; height: 64px">
        <router-link to="/" style="font-size: 18px; font-weight: 600; color: var(--rh-text); white-space: nowrap">
          栖居<span style="color: var(--rh-primary); font-size: 12px; margin-left: 4px; letter-spacing: 0.08em">RENTHUB</span>
        </router-link>

        <a-menu
          mode="horizontal"
          :selected-keys="selectedKeys"
          style="flex: 1; min-width: 0; border-bottom: none"
          @click="onMenuClick"
        >
          <a-menu-item v-for="m in menus" :key="m.key">{{ m.label }}</a-menu-item>
        </a-menu>

        <a-tooltip title="通知中心">
          <a-badge :count="auth.counts.messages" :overflow-count="99">
            <a-button type="text" shape="circle" aria-label="通知中心" @click="goto('/notifications')">
              <template #icon><span style="font-size: 16px">🔔</span></template>
            </a-button>
          </a-badge>
        </a-tooltip>

        <template v-if="auth.isLoggedIn">
          <a-dropdown placement="bottomRight">
            <a-button type="text">
              <a-avatar size="small" style="background: var(--rh-primary); margin-right: 6px">{{ auth.initial }}</a-avatar>
              {{ auth.displayName }}
            </a-button>
            <template #overlay>
              <a-menu @click="onUserMenuClick">
                <a-menu-item v-for="item in userMenu" :key="item.key">{{ item.label }}</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </template>
        <template v-else>
          <a-button type="text" @click="goto('/login')">登录</a-button>
          <a-button type="primary" @click="goto('/register')">注册</a-button>
        </template>
      </div>
    </a-layout-header>

    <a-layout-content>
      <div class="rh-container rh-page">
        <router-view />
      </div>
    </a-layout-content>

    <a-layout-footer style="text-align: center; color: var(--rh-text-3); font-size: 13px; background: #fafafa">
      <div>栖居 RentHub · 大连 · 教学演示数据（新前端 · 假后端，未接真实后端）</div>
      <div style="margin-top: 4px">Vue 3.5 · Vite 5 · Pinia 2 · Vue Router 4 · Ant Design Vue 4 · Axios 1.7</div>
    </a-layout-footer>
  </a-layout>
</template>
