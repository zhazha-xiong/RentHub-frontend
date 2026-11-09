<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { adminApi } from '@/api'
import type { User } from '@/api/types'
import { dateOnly } from '@/utils/format'

/**
 * 管理员 · 用户管理 —— 与房源处置/资质审核同一套 v2 骨架：
 *   .head → .toolbar → table.table
 */
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

const ROLE_LABEL: Record<string, string> = { tenant: '租客', merchant: '商家', admin: '管理员' }

async function load() {
  loading.value = true
  try {
    const data = await adminApi.users({ keyword: keyword.value.trim() || undefined })
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
  /* 启用不需要填原因，直接执行；禁用要填原因，走弹窗 */
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
    <div class="head">
      <div><h1>用户管理</h1></div>
      <div class="right">
        <button class="btn ghost sm" type="button" :disabled="loading" @click="load">刷新</button>
      </div>
    </div>

    <div class="toolbar">
      <input
        v-model="keyword"
        type="search"
        placeholder="搜索账号或昵称"
        aria-label="搜索用户"
        @keydown.enter.prevent="load()"
        @blur="load()"
      />
      <span class="grow" />
      <span class="note">{{ rows.length }} 个账号</span>
    </div>

    <p v-if="loading && !rows.length" class="loading-hint">正在加载…</p>
    <p v-else-if="!rows.length" class="empty">没有符合条件的账号</p>

    <table v-else class="table">
      <thead>
        <tr><th>账号</th><th>昵称</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td>{{ row.account }}</td>
          <td>{{ row.nickname }}</td>
          <td>{{ ROLE_LABEL[row.role] ?? row.role }}</td>
          <td>
            <span :class="row.status === 'active' ? 'tag ok' : 'tag plain'">{{ row.status === 'active' ? '正常' : '已禁用' }}</span>
          </td>
          <td>{{ row.created_at ? dateOnly(row.created_at) : '—' }}</td>
          <td>
            <button v-if="row.status === 'active'" class="btn ghost sm" type="button" @click="open(row, 'disable')">禁用</button>
            <button v-else class="btn ghost sm" type="button" @click="open(row, 'enable')">启用</button>
          </td>
        </tr>
      </tbody>
    </table>

    <p class="hint">禁用后该账号无法登录，其名下在架房源会同步下架。</p>

    <a-modal
      v-model:open="modalOpen"
      title="禁用账号"
      ok-text="确认禁用"
      cancel-text="取消"
      :confirm-loading="submitting"
      @ok="submit"
    >
      <p class="hint">禁用后该账号无法登录，其名下在架房源会同步下架。</p>
      <textarea v-model="reason"  rows="3"  maxlength="255"  placeholder="例如：多次发布虚假房源信息" />
      <div v-if="reasonError" style="color: var(--danger); margin-top: 8px; font-size: 13px">{{ reasonError }}</div>
    </a-modal>
  </div>
</template>
