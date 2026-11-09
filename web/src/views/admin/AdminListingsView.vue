<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { adminApi } from '@/api'
import { LISTING_STATUS, money } from '@/utils/format'

type Row = { id: number; title: string; merchant_name: string; region_name: string; rent: number; status: string; published_at: string | null }

const rows = ref<Row[]>([])
const loading = ref(true)
const keyword = ref('')
const status = ref<string | undefined>(undefined)

const modalOpen = ref(false)
const target = ref<Row | null>(null)
const reason = ref('')
const reasonError = ref('')
const submitting = ref(false)

const columns = [
  { title: '房源', dataIndex: 'title', key: 'title' },
  { title: '商家', dataIndex: 'merchant_name', key: 'merchant', width: 140 },
  { title: '区域', dataIndex: 'region_name', key: 'region', width: 110 },
  { title: '租金', key: 'rent', width: 130 },
  { title: '状态', key: 'status', width: 110 },
  { title: '操作', key: 'action', width: 120 },
]

async function load() {
  loading.value = true
  try {
    const data = await adminApi.listings({ keyword: keyword.value || undefined, status: status.value })
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
    <div class="rh-section-title">
      <h1 style="font-size: 22px; margin: 0">房源处置</h1>
      <a-space>
        <a-input v-model:value="keyword" allow-clear placeholder="标题 / 小区" style="width: 200px" @press-enter="load" />
        <a-select
          v-model:value="status"
          allow-clear
          placeholder="全部状态"
          style="width: 140px"
          :options="[
            { value: 'online', label: '在架' },
            { value: 'offline', label: '已下架' },
            { value: 'locked', label: '已锁定' },
            { value: 'rented', label: '已出租' },
          ]"
          @change="load"
        />
        <a-button @click="load">查询</a-button>
      </a-space>
    </div>

    <a-table :columns="columns" :data-source="rows" :loading="loading" row-key="id" :pagination="false">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'rent'">
          <span class="rh-price">{{ money(record.rent) }}</span> 元/月
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="LISTING_STATUS[record.status]?.color">{{ LISTING_STATUS[record.status]?.text ?? record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-button size="small" danger :disabled="record.status !== 'online'" @click="openOffline(record as Row)">强制下架</a-button>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalOpen" title="强制下架房源" ok-text="确认下架" cancel-text="取消" :confirm-loading="submitting" @ok="submitOffline">
      <p class="rh-muted">下架原因会通过站内通知发给商家。</p>
      <a-textarea v-model:value="reason" :rows="3" :maxlength="255" show-count placeholder="例如：房源图片与实际不符，请核实后重新提交" />
      <div v-if="reasonError" style="color: #e5484d; margin-top: 8px; font-size: 13px">{{ reasonError }}</div>
    </a-modal>
  </div>
</template>
