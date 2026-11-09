<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { orderApi } from '@/api'
import type { OrderDetail } from '@/api/types'
import { ORDER_STATUS, dateTime, money } from '@/utils/format'

/**
 * 我的订单 —— 结构沿用 v2 orders.html：
 *   h1 → nav.tabs（全部/待确认/已确认/已完成/已取消，带计数）→ article.order（.top/.body/.foot）
 */
const route = useRoute()
const router = useRouter()

const items = ref<OrderDetail[]>([])
const counts = ref<Record<string, number>>({})
const loading = ref(true)
const tab = ref(typeof route.query.tab === 'string' ? route.query.tab : 'all')

const TABS = computed(() => [
  { key: 'all', label: '全部', n: counts.value.all ?? 0 },
  { key: 'pending', label: '待确认', n: counts.value.pending ?? 0 },
  { key: 'confirmed', label: '已确认', n: counts.value.confirmed ?? 0 },
  { key: 'completed', label: '已完成', n: counts.value.completed ?? 0 },
  { key: 'rejected', label: '已拒绝', n: counts.value.rejected ?? 0 },
  { key: 'cancelled', label: '已取消', n: counts.value.cancelled ?? 0 },
])

/** 状态 → v2 现有的 tag 变体（v2 只有 warn/ok/plain/hue 四种） */
const STATUS_TAG: Record<string, string> = {
  pending: 'tag warn',
  confirmed: 'tag ok',
  completed: 'tag plain',
  rejected: 'tag warn',
  cancelled: 'tag plain',
}

async function load(next?: string) {
  loading.value = true
  try {
    const data = await orderApi.list({ tab: tab.value, limit: 20, ...(next ? { cursor: next } : {}) })
    items.value = next ? [...items.value, ...data.items] : data.items
    counts.value = data.counts
    if (!next) await router.replace({ query: tab.value === 'all' ? {} : { tab: tab.value } })
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

/** 订单快照是 Record<string, unknown>，模板里统一走这个函数取字符串（避免 unknown 直接插值） */
function snap(order: OrderDetail, key: string): string {
  const v = order.snapshot?.[key]
  return v == null ? '' : String(v)
}

async function cancel(order: OrderDetail) {
  try {
    await orderApi.cancel(order.id, '租客取消')
    message.success('订单已取消')
    await load()
  } catch (err) {
    message.error((err as Error).message)
  }
}

onMounted(() => void load())
</script>

<template>
  <div>
    <h1>我的订单</h1>

    <nav class="tabs" aria-label="订单状态">
      <a
        v-for="t in TABS"
        :key="t.key"
        href="#"
        :class="{ on: tab === t.key }"
        @click.prevent="pick(t.key)"
      >
        {{ t.label }} <span class="n">{{ t.n }}</span>
      </a>
    </nav>

    <p v-if="loading && !items.length" class="loading-hint">正在加载…</p>
    <p v-else-if="!items.length" class="empty">暂无订单，<router-link to="/">去找房</router-link></p>

    <article v-for="order in items" :key="order.id" class="order">
      <div class="top">
        <span>订单号 {{ order.order_no }}</span>
        <span>{{ dateTime(order.created_at) }}</span>
        <span class="st"><span :class="STATUS_TAG[order.status] ?? 'tag'">{{ ORDER_STATUS[order.status]?.text ?? order.status }}</span></span>
      </div>

      <div class="body">
        <img :src="order.cover" :alt="order.listing_title" loading="lazy" />
        <div>
          <p class="t">{{ order.listing_title || snap(order, 'title') }}</p>
          <p class="m">{{ snap(order, 'regionName') }}<template v-if="snap(order, 'layout')"> · {{ snap(order, 'layout') }}</template></p>
          <p class="m">租期 {{ order.months }} 个月 · 入住 {{ order.check_in_date }}</p>
        </div>
        <div class="amt">
          <b>{{ money(order.total_amount) }}</b>
          <p>含押金 {{ money(order.deposit) }}</p>
        </div>
      </div>

      <div class="foot">
        <button v-if="order.can_cancel" class="btn ghost sm" type="button" @click="cancel(order)">取消订单</button>
        <button v-if="order.can_pay" class="btn sm" type="button" @click="router.push(`/orders/${order.id}`)">去支付</button>
        <button class="btn ghost sm" type="button" @click="router.push(`/orders/${order.id}`)">查看详情</button>
      </div>
    </article>

    <div v-if="items.length" style="text-align: center; margin-top: 20px">
      <button class="btn ghost" type="button" :disabled="loading" @click="load()">{{ loading ? '加载中…' : '刷新' }}</button>
    </div>
  </div>
</template>
