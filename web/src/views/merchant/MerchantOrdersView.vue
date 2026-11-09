<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { orderApi } from '@/api'
import type { OrderDetail } from '@/api/types'
import { ORDER_STATUS, dateTime, money } from '@/utils/format'

const router = useRouter()
const rows = ref<OrderDetail[]>([])
const loading = ref(true)
const tab = ref('pending')
const counts = ref<Record<string, number>>({})

const modalOpen = ref(false)
const target = ref<OrderDetail | null>(null)
const reason = ref('')
const reasonError = ref('')
const submitting = ref(false)

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待确认' },
  { key: 'confirmed', label: '已确认' },
  { key: 'completed', label: '已完成' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'cancelled', label: '已取消' },
]

const columns = [
  { title: '订单 / 房源', key: 'order' },
  { title: '租客', key: 'tenant' },
  { title: '租期 / 入住', key: 'lease', width: 190 },
  { title: '金额', key: 'amount', width: 130 },
  { title: '状态', key: 'status', width: 120 },
  { title: '操作', key: 'action', width: 200 },
]

async function load() {
  loading.value = true
  try {
    const data = await orderApi.list({ tab: tab.value, limit: 50 })
    rows.value = data.items
    counts.value = data.counts
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

async function act(order: OrderDetail, action: 'confirm' | 'complete') {
  try {
    if (action === 'confirm') await orderApi.confirm(order.id)
    else await orderApi.complete(order.id)
    message.success(action === 'confirm' ? '已接单' : '订单已完成')
    await load()
  } catch (err) {
    message.error((err as Error).message)
  }
}

function reject(order: OrderDetail) {
  target.value = order
  reason.value = ''
  reasonError.value = ''
  modalOpen.value = true
}

async function submitReject() {
  if (!target.value) return
  submitting.value = true
  try {
    await orderApi.reject(target.value.id, reason.value.trim())
    message.success('已拒单')
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
      <h1 style="font-size: 22px; margin: 0">订单管理</h1>
      <span class="rh-muted">待确认 {{ counts.pending ?? 0 }} 单</span>
    </div>

    <a-tabs v-model:active-key="tab" @change="load">
      <a-tab-pane v-for="t in TABS" :key="t.key" :tab="`${t.label} ${counts[t.key] ?? 0}`" />
    </a-tabs>

    <a-table :columns="columns" :data-source="rows" :loading="loading" row-key="id" :pagination="false">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'order'">
          <div style="font-weight: 600">{{ record.order_no }}</div>
          <div class="rh-muted">{{ record.listing_title }} · {{ dateTime(record.created_at) }}</div>
        </template>
        <template v-else-if="column.key === 'tenant'">
          {{ String(record.snapshot?.tenantName ?? '—') }}
        </template>
        <template v-else-if="column.key === 'lease'">
          {{ record.months }} 个月 · {{ record.check_in_date }} 入住
        </template>
        <template v-else-if="column.key === 'amount'">
          <span class="rh-price">{{ money(record.total_amount) }}</span> 元
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="ORDER_STATUS[record.status]?.color">{{ ORDER_STATUS[record.status]?.text ?? record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space>
            <a-button size="small" @click="router.push(`/orders/${record.id}`)">详情</a-button>
            <a-button v-if="record.status === 'pending'" size="small" type="primary" @click="act(record as OrderDetail, 'confirm')">接单</a-button>
            <a-button v-if="record.status === 'pending'" size="small" danger @click="reject(record as OrderDetail)">拒单</a-button>
            <a-button v-if="record.status === 'confirmed'" size="small" @click="act(record as OrderDetail, 'complete')">完成</a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal
      v-model:open="modalOpen"
      :title="`拒单：${target?.order_no ?? ''}`"
      ok-text="确认拒单"
      cancel-text="取消"
      :confirm-loading="submitting"
      @ok="submitReject"
    >
      <p class="rh-muted">拒单原因会展示给租客（不超过 100 字）。</p>
      <a-textarea v-model:value="reason" :rows="3" :maxlength="100" show-count placeholder="例如：该房源已被长租预定" />
      <div v-if="reasonError" style="color: #e5484d; margin-top: 8px; font-size: 13px">{{ reasonError }}</div>
    </a-modal>
  </div>
</template>
