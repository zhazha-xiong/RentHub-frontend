<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/api/http'
import { AUTH_ART } from '@/utils/photos'

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
  <!-- 结构与 class 完全沿用 v2 register.html -->
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
        <h1>注册</h1>

        <div class="role-switch two" role="tablist" aria-label="注册身份">
          <button type="button" role="tab" :class="{ on: form.role === 'tenant' }" :aria-selected="form.role === 'tenant'" @click="form.role = 'tenant'">租客</button>
          <button type="button" role="tab" :class="{ on: form.role === 'merchant' }" :aria-selected="form.role === 'merchant'" @click="form.role = 'merchant'">商家</button>
        </div>

        <div v-if="errorText" class="alert">{{ errorText }}</div>

        <form class="auth-fields" @submit.prevent="submit">
          <div class="field">
            <label for="acct2">账号</label>
            <input id="acct2" v-model="form.account" type="text" placeholder="4~20 位字母或数字" autocomplete="username" />
            <p v-if="fieldErrors.account" class="hint" style="color: var(--danger)">{{ fieldErrors.account }}</p>
          </div>
          <div class="field">
            <label for="pwd2">密码</label>
            <input id="pwd2" v-model="form.password" type="password" placeholder="8~20 位，含字母与数字" autocomplete="new-password" />
            <p v-if="fieldErrors.password" class="hint" style="color: var(--danger)">{{ fieldErrors.password }}</p>
          </div>
          <div class="field">
            <label for="pwd3">确认密码</label>
            <input id="pwd3" v-model="form.confirm" type="password" placeholder="再输入一次" autocomplete="new-password" />
            <p v-if="fieldErrors.confirm" class="hint" style="color: var(--danger)">{{ fieldErrors.confirm }}</p>
          </div>
          <div class="field">
            <label for="nick">昵称（选填）</label>
            <input id="nick" v-model="form.nickname" type="text" :maxlength="32" placeholder="不填则由系统随机生成" />
          </div>
          <button class="btn auth-btn" type="submit" :disabled="loading">{{ loading ? '注册中…' : '注册并进入' }}</button>
        </form>

        <p class="auth-alt">已有账号？<router-link to="/login">去登录</router-link></p>
        <p class="hint">昵称由系统随机生成，注册后可在「个人信息」里修改；注册商家后需要先提交资质，通过后才能上架房源。</p>
      </div>
      <p class="auth-foot">栖居 RentHub · 软件工程综合实训 · 全部数据为教学演示</p>
    </main>
  </div>
</template>
