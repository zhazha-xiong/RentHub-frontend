<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/api/http'
import { AUTH_ART } from '@/utils/photos'
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
  <!-- 结构与 class 完全沿用 v2 login.html：.auth > .auth-art（左图）+ .auth-main > .auth-box -->
  <div class="auth">
    <aside class="auth-art">
      <img :src="AUTH_ART" alt="房源实拍，演示图片" />
      <div class="auth-art-in">
        <router-link class="brand" to="/">栖居<span class="brand-en">RentHub</span></router-link>
        <p class="tagline">在大连，找到下一年住的地方</p>
      </div>
    </aside>

    <main class="auth-main">
      <div class="auth-box">
        <h1>登录</h1>

        <div class="role-switch" role="tablist" aria-label="登录入口">
          <button
            v-for="r in ROLE_TABS"
            :key="r.key"
            type="button"
            role="tab"
            :class="{ on: form.role === r.key }"
            :aria-selected="form.role === r.key"
            @click="fillDemo(r.key)"
          >
            {{ r.tab }}
          </button>
        </div>

        <div v-if="errorText" class="alert">{{ errorText }}</div>

        <form class="auth-fields" @submit.prevent="submit">
          <div class="field">
            <label for="acct">账号</label>
            <input id="acct" v-model="form.account" type="text" placeholder="4~20 位字母或数字" autocomplete="username" />
          </div>
          <div class="field">
            <label for="pwd">密码</label>
            <input id="pwd" v-model="form.password" type="password" placeholder="8~20 位，含字母与数字" autocomplete="current-password" />
          </div>
          <div class="auth-row">
            <label class="check"><input v-model="form.remember" type="checkbox" /> 7 天内记住我</label>
            <a href="#" @click.prevent>忘记密码？</a>
          </div>
          <button class="btn auth-btn" type="submit" :disabled="loading">{{ loading ? '登录中…' : '登录' }}</button>
        </form>

        <p class="auth-alt">还没有账号？<router-link to="/register">立即注册</router-link></p>
        <p class="demo-states">
          演示账号：<a href="#" @click.prevent="fillDemo('tenant')">租客 xiaofs</a><span>·</span>
          <a href="#" @click.prevent="fillDemo('merchant')">商家 xingchen</a><span>·</span>
          <a href="#" @click.prevent="fillDemo('admin')">管理员 guanli</a>
        </p>
      </div>
      <p class="auth-foot">栖居 RentHub · 软件工程综合实训 · 全部数据为教学演示</p>
    </main>
  </div>
</template>
