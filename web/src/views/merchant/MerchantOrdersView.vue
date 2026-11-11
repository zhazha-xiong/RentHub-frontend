<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { orderApi } from '@/api'
import type { OrderDetail } from '@/api/types'
import { ORDER_STATUS, dateTime, money, ORDER_TAG as STATUS_TAG } from '@/utils/format'

/**
 * 商家 · 订单管理 —— 结构沿用 v2 merchant-orders.html：
 *   h1 → nav.tabs（带计数）→ table.table（订单与房源 / 租客 / 租期 / 金额 / 提交时间 / 操作）
 *
 * 默认签页用「全部」：E2E 里先用 API 造状态再验页面，默认过滤会看不到刚变状态的单子。
 */
const router = useRouter()
const rows = ref<OrderDetail[]>([])
const loading = ref(true)
const tab = ref('all')
const counts = ref<Record<string, number>>({})

const modalOpen = ref(false)
const target = ref<OrderDetail | null>(null)
const reason = ref('')
const reasonError = ref('')
const submitting = ref(false)

const TABS = computed(() => [
  { key: 'all', label: '全部', n: counts.value.all ?? 0 },
  { key: 'pending', label: '待确认', n: counts.value.pending ?? 0 },
  { key: 'confirmed', label: '已确认', n: counts.value.confirmed ?? 0 },
  { key: 'completed', label: '已完成', n: counts.value.completed ?? 0 },
  { key: 'rejected', label: '已拒绝', n: counts.value.rejected ?? 0 },
])


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

function pick(key: string) {
  if (tab.value === key) return
  tab.value = key
  void load()
}

function snap(order: OrderDetail, key: string): string {
  const v = order.snapshot?.[key]
  return v == null ? '' : String(v)
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
    <h1>订单管理</h1>

    <nav class="tabs" aria-label="订单状态">
      <a v-for="t in TABS" :key="t.key" href="#" :class="{ on: tab === t.key }" @click.prevent="pick(t.key)">
        {{ t.label }} <span class="n">{{ t.n }}</span>
      </a>
    </nav>

    <p v-if="loading && !rows.length" class="loading-hint">正在加载…</p>
    <p v-else-if="!rows.length" class="empty">当前没有{{ TABS.find((t) => t.key === tab)?.label ?? '' }}订单</p>

    <table v-else class="table">
      <thead>
        <tr>
          <th>订单与房源</th>
          <th>租客</th>
          <th>租期</th>
          <th class="num">金额</th>
          <th>提交时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td>
            <div class="t">
              <img :src="row.cover" :alt="row.listing_title" loading="lazy" />
              <div>
                <p>{{ row.order_no }}</p>
                <p class="m">{{ row.listing_title }}</p>
              </div>
            </div>
          </td>
          <td>
            {{ snap(row, 'tenantName') || '—' }}
            <p class="m">{{ snap(row, 'tenantPhone') || '' }}</p>
          </td>
          <td>
            {{ row.months }} 个月
            <p class="m">{{ row.check_in_date }} 入住</p>
          </td>
          <td class="num">{{ money(row.total_amount) }}</td>
          <td>{{ dateTime(row.created_at) }}</td>
          <td>
            <span :class="STATUS_TAG[row.status] ?? 'tag'" style="margin-right: 8px">{{ ORDER_STATUS[row.status]?.text ?? row.status }}</span>
            <button class="btn ghost sm" type="button" @click="router.push(`/orders/${row.id}`)">详情</button>
            <button v-if="row.status === 'pending'" class="btn sm" type="button" style="margin-left: 6px" @click="act(row, 'confirm')">
              接单
            </button>
            <button v-if="row.status === 'pending'" class="btn ghost sm" type="button" style="margin-left: 6px" @click="reject(row)">
              拒单
            </button>
            <button v-if="row.status === 'confirmed'" class="btn ghost sm" type="button" style="margin-left: 6px" @click="act(row, 'complete')">
              标记完成
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <p class="hint">接单后房源自动置为「已出租」；拒单需填写原因，系统会释放房源并生成退款流水。</p>

    <a-modal
      v-model:open="modalOpen"
      :title="`拒单：${target?.order_no ?? ''}`"
      ok-text="确认拒单"
      cancel-text="取消"
      :confirm-loading="submitting"
      @ok="submitReject"
    >
      <p class="hint">拒单原因会展示给租客（不超过 100 字）。</p>
      <textarea v-model="reason"  rows="3"  maxlength="100"  placeholder="例如：该房源已被长租预定" />
      <div v-if="reasonError" style="color: var(--danger); margin-top: 8px; font-size: 13px">{{ reasonError }}</div>
    </a-modal>
  </div>
</template>
