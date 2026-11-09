<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { adminApi } from '@/api'
import { LISTING_STATUS, money } from '@/utils/format'

/**
 * 管理员 · 房源处置 —— 用 v2 的 .head / .toolbar / table.table 骨架，
 * 与管理端的另外两个页面（资质审核、用户管理）保持同一套排版。
 */
type Row = {
  id: number
  title: string
  merchant_name: string
  region_name: string
  rent: number
  status: string
  published_at: string | null
}

/** 状态 → v2 现有的 tag 变体 */
const STATUS_TAG: Record<string, string> = {
  online: 'tag',
  rented: 'tag hue',
  offline: 'tag plain',
  locked: 'tag warn',
}

const rows = ref<Row[]>([])
const loading = ref(true)
const keyword = ref('')
const status = ref<string>('all')

const modalOpen = ref(false)
const target = ref<Row | null>(null)
const reason = ref('')
const reasonError = ref('')
const submitting = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await adminApi.listings({
      keyword: keyword.value.trim() || undefined,
      status: status.value === 'all' ? undefined : status.value,
    })
    rows.value = data.items
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

function openOffline(row: Row) {
  target.value = row
  reason.value = ''
  reasonError.value = ''
  modalOpen.value = true
}

async function submitOffline() {
  if (!target.value) return
  const text = reason.value.trim()
  if (!text) {
    reasonError.value = '请填写下架原因'
    return
  }
  submitting.value = true
  try {
    await adminApi.offline(target.value.id, text)
    message.success('已下架')
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
      <div><h1>房源处置</h1></div>
      <div class="right">
        <button class="btn ghost sm" type="button" :disabled="loading" @click="load">刷新</button>
      </div>
    </div>

    <div class="toolbar">
      <input
        v-model="keyword"
        type="search"
        placeholder="搜索标题或小区"
        aria-label="搜索房源"
        @keydown.enter.prevent="load()"
        @blur="load()"
      />
      <select v-model="status" class="select-sm" aria-label="状态筛选" @change="load">
        <option value="all">全部状态</option>
        <option value="online">在架</option>
        <option value="offline">已下架</option>
        <option value="locked">已锁定</option>
        <option value="rented">已出租</option>
      </select>
      <span class="grow" />
      <span class="note">{{ rows.length }} 条</span>
    </div>

    <p v-if="loading && !rows.length" class="loading-hint">正在加载…</p>
    <p v-else-if="!rows.length" class="empty">没有符合条件的房源</p>

    <table v-else class="table">
      <thead>
        <tr><th>房源</th><th>商家</th><th>区域</th><th class="num">租金</th><th>状态</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td><p>{{ row.title }}</p><p class="m">#{{ row.id }}</p></td>
          <td>{{ row.merchant_name }}</td>
          <td>{{ row.region_name }}</td>
          <td class="num">{{ money(row.rent) }} 元/月</td>
          <td><span :class="STATUS_TAG[row.status] ?? 'tag'">{{ LISTING_STATUS[row.status]?.text ?? row.status }}</span></td>
          <td>
            <button class="btn ghost sm" type="button" :disabled="row.status !== 'online'" @click="openOffline(row)">
              强制下架
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <p class="hint">强制下架后房源立即对租客不可见，下架原因会通过站内通知发给商家。</p>

    <a-modal
      v-model:open="modalOpen"
      title="强制下架房源"
      ok-text="确认下架"
      cancel-text="取消"
      :confirm-loading="submitting"
      @ok="submitOffline"
    >
      <p class="hint">下架原因会通过站内通知发给商家。</p>
      <textarea v-model="reason"  rows="3"  maxlength="255"  placeholder="例如：房源图片与实际不符，请核实后重新提交" />
      <div v-if="reasonError" style="color: var(--danger); margin-top: 8px; font-size: 13px">{{ reasonError }}</div>
    </a-modal>
  </div>
</template>
