import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi } from '@/api'
import { clearTokens, loadTokens, setTokens } from '@/api/token'
import type { Counts, MeResp, Role } from '@/api/types'

/**
 * 会话状态（Pinia）
 *
 * 只放「会话 + 计数」，业务数据一律走接口，保证刷新后不串味。
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<MeResp | null>(null)
  const counts = ref<Counts>({ favorites: 0, orders: 0, messages: 0 })
  const ready = ref(false)
  const booting = ref<Promise<void> | null>(null)

  const isLoggedIn = computed(() => Boolean(user.value))
  const role = computed<Role | 'guest'>(() => user.value?.role ?? 'guest')
  const isMerchant = computed(() => role.value === 'merchant')
  const isAdmin = computed(() => role.value === 'admin')
  const displayName = computed(() => user.value?.nickname ?? '登录 / 注册')
  const initial = computed(() => (user.value?.nickname ?? '登').slice(0, 1))

  const HOME_BY_ROLE: Record<string, string> = {
    tenant: '/',
    merchant: '/merchant/listings',
    admin: '/admin/qualifications',
    guest: '/login',
  }

  async function bootstrap(): Promise<void> {
    if (ready.value) return
    if (booting.value) return booting.value
    loadTokens()
    booting.value = (async () => {
      try {
        const me = await authApi.me()
        user.value = me
        if (me.counts) counts.value = me.counts
      } catch {
        user.value = null
      } finally {
        ready.value = true
        booting.value = null
      }
    })()
    return booting.value
  }

  function applySession(res: { access_token: string; refresh_token: string; user: MeResp; counts?: Counts }) {
    setTokens(res.access_token, res.refresh_token)
    user.value = res.user
    if (res.counts) counts.value = res.counts
  }

  async function login(payload: { account: string; password: string; role: Role; remember?: boolean }) {
    const res = await authApi.login(payload)
    applySession(res as never)
    return res
  }

  async function register(payload: { account: string; password: string; role: 'tenant' | 'merchant'; nickname?: string }) {
    const res = await authApi.register(payload)
    applySession(res as never)
    return res
  }

  async function refreshMe() {
    try {
      const me = await authApi.me()
      user.value = me
      if (me.counts) counts.value = me.counts
    } catch {
      /* 忽略：401 由中间层统一处理 */
    }
  }

  async function logout() {
    try {
      await authApi.logout()
    } catch {
      /* 已过期也允许退出 */
    }
    clearTokens()
    user.value = null
    counts.value = { favorites: 0, orders: 0, messages: 0 }
  }

  function setCounts(patch: Partial<Counts>) {
    counts.value = { ...counts.value, ...patch }
  }

  return {
    user, counts, ready, isLoggedIn, role, isMerchant, isAdmin, displayName, initial,
    HOME_BY_ROLE, bootstrap, login, register, refreshMe, logout, setCounts,
  }
})
