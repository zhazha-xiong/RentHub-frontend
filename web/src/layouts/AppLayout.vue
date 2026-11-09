<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 顶栏 + 内容容器 + 页脚
 *
 * 结构与 class 完全沿用旧版（legacy/v2-static 的 .topbar / .sheet / .page / .foot），
 * 所以 legacy.css 里的样式直接生效，视觉与旧版一致。
 */
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const open = ref(false)

/** 顶栏链接：按角色给（旧版是 找房 / 收藏 / 订单 / 通知） */
const links = computed(() => {
  if (auth.isMerchant) {
    return [
      { to: '/merchant/listings', text: '房源管理' },
      { to: '/merchant/orders', text: '订单管理' },
      { to: '/merchant/qualification', text: '商家资质' },
    ]
  }
  if (auth.isAdmin) {
    return [
      { to: '/admin/qualifications', text: '资质审核' },
      { to: '/admin/listings', text: '房源处置' },
      { to: '/admin/users', text: '用户管理' },
    ]
  }
  return [
    { to: '/', text: '找房' },
    { to: '/ai', text: 'AI 找房' },
  ]
})

/** 账号下拉：旧版顺序（收藏 → 订单 → 通知 → 个人信息 → 切换端 → 退出） */
const menu = computed(() => {
  const items: { to: string; text: string; count?: number }[] = []
  if (auth.role === 'tenant' || auth.role === 'guest') {
    items.push(
      { to: '/favorites', text: '我的收藏', count: auth.counts.favorites },
      { to: '/orders', text: '我的订单', count: auth.counts.orders },
      { to: '/notifications', text: '通知中心', count: auth.counts.messages },
      { to: '/me', text: '个人信息' },
    )
  } else if (auth.isMerchant) {
    items.push(
      { to: '/merchant/listings', text: '我的房源' },
      { to: '/merchant/orders', text: '订单管理' },
      { to: '/merchant/qualification', text: '商家信息与资质' },
    )
  } else {
    items.push(
      { to: '/admin/qualifications', text: '资质审核' },
      { to: '/admin/listings', text: '房源处置' },
      { to: '/admin/users', text: '用户管理' },
    )
  }
  return items
})

const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))

function onDocClick(e: MouseEvent) {
  if (!open.value) return
  const el = e.target as HTMLElement | null
  if (el?.closest?.('.account')) return
  open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

async function logout() {
  open.value = false
  await auth.logout()
  message.success('已退出登录')
  await router.push('/login')
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div>
    <header class="topbar">
      <router-link class="brand" to="/">栖居<span class="brand-en">RentHub</span></router-link>
      <button class="city" type="button">大连<span class="chev">▾</span></button>

      <nav class="links">
        <router-link v-for="l in links" :key="l.to" :to="l.to" :aria-current="isActive(l.to) ? 'page' : undefined">
          {{ l.text }}
        </router-link>
      </nav>

      <div class="account">
        <template v-if="auth.isLoggedIn">
          <button class="avatar-btn" type="button" aria-haspopup="menu" :aria-expanded="open ? 'true' : 'false'" @click.stop="open = !open">
            <span class="avatar">{{ auth.initial }}</span>
            <span class="uname">{{ auth.displayName }}</span>
            <span class="chev">▾</span>
          </button>
          <div v-show="open" class="menu" role="menu">
            <router-link v-for="m in menu" :key="m.to" :to="m.to" role="menuitem" @click="open = false">
              {{ m.text }}<span v-if="m.count" class="badge">{{ m.count }}</span>
            </router-link>
            <hr />
            <a role="menuitem" href="/login" @click.prevent="logout">退出登录</a>
          </div>
        </template>
        <template v-else>
          <router-link class="btn ghost" to="/login" style="text-decoration: none">登录</router-link>
          <router-link class="btn" to="/register" style="text-decoration: none">注册</router-link>
        </template>
      </div>
    </header>

    <div class="sheet">
      <div class="page" :class="{ narrow: route.meta.narrow }">
        <router-view />
        <footer class="foot">
          <span>栖居 RentHub · 大连 · 教学演示数据</span>
          <span>演示图片来自 Wikimedia Commons（CC0 / CC BY 2.0 / CC BY-SA 4.0），出处见 credits.json</span>
        </footer>
      </div>
    </div>
  </div>
</template>
