<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { adminApi } from '@/api'
import type { User } from '@/api/types'
import { dateOnly } from '@/utils/format'

type Row = User & { created_at?: string }

const rows = ref<Row[]>([])
const loading = ref(true)
const keyword = ref('')

const modalOpen = ref(false)
const target = ref<Row | null>(null)
const mode = ref<'disable' | 'enable'>('disable')
const reason = ref('')
const reasonError = ref('')
const submitting = ref(false)

const columns = [
  { title: '账号', dataIndex: 'account', key: 'account', width: 140 },
  { title: '昵称', dataIndex: 'nickname', key: 'nickname' },
  { title: '角色', key: 'role', width: 110 },
  { title: '状态', key: 'status', width: 110 },
  { title: '注册时间', key: 'created', width: 140 },
  { title: '操作', key: 'action', width: 130 },
]

const ROLE_LABEL: Record<string, string> = { tenant: '租客', merchant: '商家', admin: '管理员' }

async function load() {
  loading.value = true
  try {
    const data = await adminApi.users({ keyword: keyword.value || undefined })
    rows.value = data.items as Row[]
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

function open(row: Row, m: 'disable' | 'enable') {
  target.value = row
  mode.value = m
  reason.value = ''
  reasonError.value = ''
  if (m === 'enable') {
    void submit()
    return
  }
  modalOpen.value = true
}

async function submit() {
  if (!target.value) return
  submitting.value = true
  try {
    if (mode.value === 'disable') {
      const text = reason.value.trim()
      if (!text) {
        reasonError.value = '请填写禁用原因'
        return
      }
      await adminApi.disable(target.value.id, text)
      message.success('已禁用该账号，其在架房源已同步下架')
    } else {
      await adminApi.enable(target.value.id)
      message.success('已启用该账号')
    }
    modalOpen.value = false
    await load()
  } catch (err) {
    reasonError.value = (err as Error).message
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="rh-section-title">
      <h1 style="font-size: 22px; margin: 0">用户管理</h1>
      <a-space>
        <a-input v-model:value="keyword" allow-clear placeholder="账号 / 昵称" style="width: 200px" @press-enter="load" />
        <a-button @click="load">查询</a-button>
      </a-space>
    </div>

    <a-table :columns="columns" :data-source="rows" :loading="loading" row-key="id" :pagination="false">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'role'">{{ ROLE_LABEL[record.role] ?? record.role }}</template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="record.status === 'active' ? 'success' : 'error'">{{ record.status === 'active' ? '正常' : '已禁用' }}</a-tag>
        </template>
        <template v-else-if="column.key === 'created'">{{ dateOnly(record.created_at) }}</template>
        <template v-else-if="column.key === 'action'">
          <a-button v-if="record.status === 'active'" size="small" danger @click="open(record as Row, 'disable')">禁用</a-button>
          <a-button v-else size="small" @click="open(record as Row, 'enable')">启用</a-button>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalOpen" title="禁用账号" ok-text="确认禁用" cancel-text="取消" :confirm-loading="submitting" @ok="submit">
      <p class="rh-muted">禁用后该账号无法登录，其名下在架房源会同步下架。</p>
      <a-textarea v-model:value="reason" :rows="3" :maxlength="255" show-count placeholder="例如：多次发布虚假房源信息" />
      <div v-if="reasonError" style="color: #e5484d; margin-top: 8px; font-size: 13px">{{ reasonError }}</div>
    </a-modal>
  </div>
</template>
