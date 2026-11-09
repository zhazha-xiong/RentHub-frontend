<script setup lang="ts">
import { reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/api/types'

const auth = useAuthStore()

const pwd = reactive({ old_password: '', new_password: '', confirm: '' })
const saving = ref(false)

const ROLE_LABEL: Record<Role, string> = { tenant: '租客', merchant: '商家', admin: '管理员' }

async function changePassword() {
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
  <a-row :gutter="20">
    <a-col :xs="24" :md="12">
      <a-card title="账号信息">
        <a-descriptions :column="1" size="small">
          <a-descriptions-item label="昵称">{{ auth.user?.nickname }}</a-descriptions-item>
          <a-descriptions-item label="账号">{{ auth.user?.account }}</a-descriptions-item>
          <a-descriptions-item label="身份">{{ auth.user ? ROLE_LABEL[auth.user.role] : '—' }}</a-descriptions-item>
          <a-descriptions-item label="手机号">{{ auth.user?.phone ?? '未填写' }}</a-descriptions-item>
          <a-descriptions-item v-if="auth.isMerchant" label="资质状态">
            {{ auth.user?.qualification_status ?? 'not_submitted' }}
          </a-descriptions-item>
          <a-descriptions-item label="收藏 / 订单 / 未读">
            {{ auth.counts.favorites }} / {{ auth.counts.orders }} / {{ auth.counts.messages }}
          </a-descriptions-item>
        </a-descriptions>
        <a-divider />
        <div class="rh-muted">
          演示环境不校验真实身份信息；资料编辑接口在技术文档中为 <code>PUT /api/v1/users/me</code>（暂未纳入本次 demo）。
        </div>
      </a-card>
    </a-col>

    <a-col :xs="24" :md="12">
      <a-card title="修改密码">
        <a-form layout="vertical" :model="pwd" @submit.prevent="changePassword">
          <a-form-item label="当前密码">
            <a-input-password v-model:value="pwd.old_password" autocomplete="current-password" />
          </a-form-item>
          <a-form-item label="新密码">
            <a-input-password v-model:value="pwd.new_password" autocomplete="new-password" placeholder="8-20 位，含字母与数字" />
          </a-form-item>
          <a-form-item label="确认新密码">
            <a-input-password v-model:value="pwd.confirm" autocomplete="new-password" />
          </a-form-item>
          <a-button type="primary" html-type="submit" :loading="saving">保存修改</a-button>
        </a-form>
        <a-divider />
        <div class="rh-muted">修改成功后其它设备上的登录会自动失效（服务端会吊销刷新令牌）。</div>
      </a-card>
    </a-col>
  </a-row>
</template>
