<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/api/http'
import type { Role } from '@/api/types'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const form = reactive({ role: 'tenant' as Role, account: '', password: '', remember: true })
const loading = ref(false)
const errorText = ref('')

/** 技术文档里的错误码 → 用户能看懂的文案（登录失败锁定不是假文案） */
const ERROR_TEXT: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: '账号或密码错误',
  AUTH_ROLE_MISMATCH: '登录入口与账号角色不符，请切换到正确的入口',
  AUTH_LOCKED: '连续 5 次密码错误，账号已锁定 15 分钟',
  AUTH_ACCOUNT_DISABLED: '账号已被禁用，请联系管理员',
}

const ROLE_TABS: { key: Role; tab: string; account: string }[] = [
  { key: 'tenant', tab: '租客', account: 'xiaofs' },
  { key: 'merchant', tab: '商家', account: 'xingchen' },
  { key: 'admin', tab: '管理员', account: 'guanli' },
]

function fillDemo(role: Role) {
  const hit = ROLE_TABS.find((r) => r.key === role)
  form.role = role
  form.account = hit?.account ?? ''
  form.password = 'renthub123'
}

async function submit() {
  if (!form.account || !form.password) {
    errorText.value = '请填写账号与密码'
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    await auth.login({ account: form.account, password: form.password, role: form.role, remember: form.remember })
    message.success(`欢迎回来，${auth.displayName}`)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    await router.replace(redirect || auth.HOME_BY_ROLE[auth.role] || '/')
  } catch (err) {
    const apiErr = err as ApiError
    errorText.value = ERROR_TEXT[apiErr.code] ?? apiErr.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (auth.isLoggedIn) void router.replace(auth.HOME_BY_ROLE[auth.role] ?? '/')
})
</script>

<template>
  <div class="auth-wrap">
    <div class="auth-panel">
      <router-link to="/" class="auth-brand">栖居<span>RENTHUB</span></router-link>
      <h1>在大连，找到下一年住的地方</h1>
      <div class="rh-muted" style="margin-bottom: 18px">登录后可收藏房源、下单与查看订单</div>

      <a-tabs v-model:active-key="form.role" centered @change="(k) => fillDemo(k as Role)">
        <a-tab-pane v-for="r in ROLE_TABS" :key="r.key" :tab="r.tab" />
      </a-tabs>

      <a-alert v-if="errorText" type="error" :message="errorText" show-icon style="margin-bottom: 14px" />

      <a-form layout="vertical" :model="form" @submit.prevent="submit">
        <a-form-item label="账号">
          <a-input v-model:value="form.account" size="large" autocomplete="username" placeholder="4-20 位字母或数字" />
        </a-form-item>
        <a-form-item label="密码">
          <a-input-password v-model:value="form.password" size="large" autocomplete="current-password" placeholder="至少 8 位，含字母与数字" />
        </a-form-item>
        <a-form-item>
          <a-checkbox v-model:checked="form.remember">7 天内记住我</a-checkbox>
        </a-form-item>
        <a-button type="primary" size="large" block html-type="submit" :loading="loading">登录</a-button>
      </a-form>

      <div style="margin-top: 14px; display: flex; justify-content: space-between; align-items: center">
        <span class="rh-muted">还没有账号？<router-link to="/register">立即注册</router-link></span>
        <a-dropdown>
          <a class="rh-muted">演示账号 ▾</a>
          <template #overlay>
            <a-menu>
              <a-menu-item v-for="r in ROLE_TABS" :key="r.key" @click="fillDemo(r.key)">
                {{ r.tab }}：{{ r.account }} / renthub123
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  background: linear-gradient(160deg, #f0f6ff 0%, #f5f5f5 55%, #fafafa 100%);
}
.auth-panel {
  width: min(440px, 100%);
  background: #fff;
  border: 1px solid var(--rh-border);
  border-radius: 12px;
  padding: 28px 28px 24px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.06);
}
.auth-brand {
  font-size: 18px;
  font-weight: 600;
  color: var(--rh-text);
}
.auth-brand span {
  margin-left: 6px;
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--rh-primary);
}
h1 {
  font-size: 20px;
  margin: 18px 0 6px;
}
</style>
