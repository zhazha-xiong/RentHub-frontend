<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/api/http'

const auth = useAuthStore()
const router = useRouter()

const form = reactive({ role: 'tenant' as 'tenant' | 'merchant', account: '', password: '', confirm: '', nickname: '' })
const loading = ref(false)
const errorText = ref('')
const fieldErrors = ref<Record<string, string>>({})

async function submit() {
  errorText.value = ''
  fieldErrors.value = {}
  if (!/^[a-zA-Z0-9]{4,20}$/.test(form.account)) {
    fieldErrors.value = { account: '账号需为 4-20 位字母或数字' }
    return
  }
  if (form.password.length < 8 || form.password.length > 20 || !/[a-zA-Z]/.test(form.password) || !/\d/.test(form.password)) {
    fieldErrors.value = { password: '密码需 8-20 位且同时包含字母与数字' }
    return
  }
  if (form.password !== form.confirm) {
    fieldErrors.value = { confirm: '两次输入的密码不一致' }
    return
  }
  loading.value = true
  try {
    await auth.register({
      account: form.account,
      password: form.password,
      role: form.role,
      nickname: form.nickname || undefined,
    })
    message.success('注册成功，已自动登录')
    await router.replace(auth.HOME_BY_ROLE[auth.role] ?? '/')
  } catch (err) {
    const apiErr = err as ApiError
    fieldErrors.value = apiErr.fieldErrors ?? {}
    errorText.value = apiErr.code === 'AUTH_ACCOUNT_TAKEN' ? '该账号已被注册' : apiErr.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-wrap">
    <div class="auth-panel">
      <router-link to="/" class="auth-brand">栖居<span>RENTHUB</span></router-link>
      <h1>注册账号</h1>
      <div class="rh-muted" style="margin-bottom: 18px">商家注册后需要先提交资质，通过审核才能上架房源</div>

      <a-alert v-if="errorText" type="error" :message="errorText" show-icon style="margin-bottom: 14px" />

      <a-form layout="vertical" :model="form" @submit.prevent="submit">
        <a-form-item label="注册身份">
          <a-radio-group v-model:value="form.role" button-style="solid">
            <a-radio-button value="tenant">租客</a-radio-button>
            <a-radio-button value="merchant">商家</a-radio-button>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="账号" :validate-status="fieldErrors.account ? 'error' : undefined" :help="fieldErrors.account">
          <a-input v-model:value="form.account" size="large" placeholder="4-20 位字母或数字" />
        </a-form-item>
        <a-form-item label="密码" :validate-status="fieldErrors.password ? 'error' : undefined" :help="fieldErrors.password">
          <a-input-password v-model:value="form.password" size="large" placeholder="8-20 位，含字母与数字" />
        </a-form-item>
        <a-form-item label="确认密码" :validate-status="fieldErrors.confirm ? 'error' : undefined" :help="fieldErrors.confirm">
          <a-input-password v-model:value="form.confirm" size="large" />
        </a-form-item>
        <a-form-item label="昵称（选填，不填自动生成）">
          <a-input v-model:value="form.nickname" size="large" :maxlength="32" />
        </a-form-item>
        <a-button type="primary" size="large" block html-type="submit" :loading="loading">注册并登录</a-button>
      </a-form>

      <div style="margin-top: 14px" class="rh-muted">
        已有账号？<router-link to="/login">去登录</router-link>
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
  width: min(460px, 100%);
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
