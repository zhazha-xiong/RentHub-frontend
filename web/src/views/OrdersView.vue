<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { orderApi } from '@/api'
import type { OrderDetail } from '@/api/types'
import { ORDER_STATUS, dateTime, money } from '@/utils/format'

const route = useRoute()
const router = useRouter()

const items = ref<OrderDetail[]>([])
const counts = ref<Record<string, number>>({})
const loading = ref(true)
const tab = ref(typeof route.query.tab === 'string' ? route.query.tab : 'all')

const TABS = computed(() => [
  { key: 'all', label: `全部 ${counts.value.all ?? 0}` },
  { key: 'pending', label: `待确认 ${counts.value.pending ?? 0}` },
  { key: 'confirmed', label: `已确认 ${counts.value.confirmed ?? 0}` },
  { key: 'completed', label: `已完成 ${counts.value.completed ?? 0}` },
  { key: 'rejected', label: `已拒绝 ${counts.value.rejected ?? 0}` },
  { key: 'cancelled', label: `已取消 ${counts.value.cancelled ?? 0}` },
])

async function load() {
  loading.value = true
  try {
    const data = await orderApi.list({ tab: tab.value, limit: 20 })
    items.value = data.items
    counts.value = data.counts
    await router.replace({ query: tab.value === 'all' ? {} : { tab: tab.value } })
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <h1 style="font-size: 22px; margin: 0 0 12px">我的订单</h1>

    <a-tabs v-model:active-key="tab" @change="load">
      <a-tab-pane v-for="t in TABS" :key="t.key" :tab="t.label" />
    </a-tabs>

    <a-spin :spinning="loading">
      <a-empty v-if="!items.length && !loading" class="rh-empty" description="暂无订单" />

      <a-card v-for="order in items" :key="order.id" style="margin-bottom: 14px" :body-style="{ padding: 16 }">
        <div style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 10px">
          <div class="rh-muted">
            订单号 {{ order.order_no }} · {{ dateTime(order.created_at) }}
          </div>
          <a-tag :color="ORDER_STATUS[order.status]?.color">{{ ORDER_STATUS[order.status]?.text ?? order.status }}</a-tag>
        </div>

        <div style="display: flex; gap: 14px; align-items: center">
          <img :src="order.cover" alt="" style="width: 104px; height: 78px; object-fit: cover; border-radius: 6px" />
          <div style="flex: 1; min-width: 180px">
            <div style="font-weight: 600">
              <router-link :to="`/listings/${order.snapshot?.listingId ?? ''}`">
                {{ order.listing_title || String(order.snapshot?.title ?? '') }}
              </router-link>
            </div>
            <div class="rh-muted">
              租期 {{ order.months }} 个月 · 入住 {{ order.check_in_date }}
            </div>
          </div>
          <div style="text-align: right">
            <div class="rh-price" style="font-size: 18px">{{ money(order.total_amount) }} 元</div>
            <div class="rh-muted">含押金 {{ money(order.deposit) }}</div>
          </div>
        </div>

        <a-divider style="margin: 12px 0" />
        <a-space wrap>
          <a-button size="small" @click="router.push(`/orders/${order.id}`)">查看详情</a-button>
          <a-button v-if="order.can_pay" size="small" type="primary" @click="router.push(`/orders/${order.id}`)">去支付</a-button>
        </a-space>
      </a-card>
    </a-spin>
  </div>
</template>
