<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { dateOnly } from '@/utils/format'
import type { Role } from '@/api/types'

/**
 * 个人信息 —— 结构沿用 v2 profile.html：
 *   左栏 .form > .fieldset（.grid2 两列表单）
 *   右栏 .summary（资料完整度 + 保存按钮）
 * 演示环境没有「修改昵称」接口（技术文档里是 PUT /users/me，未纳入本次 demo），
 * 所以账号类字段与 v2 一样是 disabled，右侧按钮提交的是密码修改。
 */
const auth = useAuthStore()

const pwd = reactive({ old_password: '', new_password: '', confirm: '' })
const saving = ref(false)

const ROLE_LABEL: Record<Role, string> = { tenant: '租客', merchant: '商家', admin: '管理员' }

/** 资料完整度：只按已填写的字段算（头像/实名在 demo 里没有上传入口） */
const filled = computed(() => [
  { label: '昵称', done: Boolean(auth.user?.nickname) },
  { label: '手机号', done: Boolean(auth.user?.phone) },
  { label: '头像', done: false },
  { label: '实名信息', done: false },
])
const percent = computed(() => Math.round((filled.value.filter((f) => f.done).length / filled.value.length) * 100))

async function changePassword() {
  if (!pwd.old_password || !pwd.new_password) {
    message.error('请填写当前密码与新密码')
    return
  }
  if (pwd.new_password !== pwd.confirm) {
    message.error('两次输入的新密码不一致')
    return
  }
  saving.value = true
  try {
    await authApi.changePassword({ old_password: pwd.old_password, new_password: pwd.new_password })
    message.success('密码已修改，其它设备上的登录已失效')
    pwd.old_password = ''
    pwd.new_password = ''
    pwd.confirm = ''
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <h1>个人信息</h1>

    <div class="form">
      <div>
        <div class="fieldset">
          <h2>账号</h2>
          <div class="grid2">
            <div class="field">
              <label for="nick">昵称</label>
              <input id="nick" type="text" :value="auth.user?.nickname ?? ''" disabled />
            </div>
            <div class="field">
              <label for="acct">账号</label>
              <input id="acct" type="text" :value="auth.user?.account ?? ''" disabled />
            </div>
            <div class="field">
              <label for="phone2">手机号</label>
              <input id="phone2" type="text" :value="auth.user?.phone ?? '未填写'" disabled />
            </div>
            <div class="field">
              <label for="role2">身份</label>
              <input id="role2" type="text" :value="auth.user ? ROLE_LABEL[auth.user.role] : '—'" disabled />
            </div>
            <div v-if="auth.isMerchant" class="field">
              <label for="qual">资质状态</label>
              <input id="qual" type="text" :value="auth.user?.qualification_status ?? 'not_submitted'" disabled />
            </div>
            <div class="field">
              <label for="reg">注册时间</label>
              <input id="reg" type="text" :value="dateOnly(auth.user?.created_at)" disabled />
            </div>
          </div>
        </div>

        <div class="fieldset">
          <h2>登录密码</h2>
          <div class="grid2">
            <div class="field">
              <label for="old">当前密码</label>
              <input id="old" v-model="pwd.old_password" type="password" autocomplete="current-password" />
            </div>
            <div class="field">
              <label for="new">新密码</label>
              <input id="new" v-model="pwd.new_password" type="password" placeholder="8~20 位，含字母与数字" autocomplete="new-password" />
            </div>
            <div class="field">
              <label for="new2">确认新密码</label>
              <input id="new2" v-model="pwd.confirm" type="password" placeholder="再输入一次" autocomplete="new-password" />
            </div>
          </div>
          <p class="hint">修改后其它设备上的登录会自动失效（服务端会吊销刷新令牌）。</p>
        </div>
      </div>

      <aside class="summary">
        <h2>资料完整度</h2>
        <div v-for="f in filled" :key="f.label" class="row">
          <span>{{ f.label }}</span><b :style="f.done ? undefined : { color: 'var(--text-3)' }">{{ f.done ? '已填写' : '未填写' }}</b>
        </div>
        <div class="total"><span>完整度</span><b>{{ percent }}%</b></div>
        <button class="btn" type="button" :disabled="saving" @click="changePassword">
          {{ saving ? '保存中…' : '保存修改' }}
        </button>
        <p class="fine">演示环境不校验真实身份信息；昵称与头像的编辑接口未纳入本次 demo。</p>
      </aside>
    </div>
  </div>
</template>
