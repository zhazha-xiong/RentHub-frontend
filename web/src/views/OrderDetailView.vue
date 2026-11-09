<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { orderApi } from '@/api'
import type { OrderDetail } from '@/api/types'
import { ORDER_STATUS, dateTime, money } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()
const order = ref<OrderDetail | null>(null)
const loading = ref(true)
const acting = ref(false)

const id = computed(() => String(route.params.id))
const status = computed(() => (order.value ? ORDER_STATUS[order.value.status] : null))

async function load() {
  loading.value = true
  try {
    order.value = await orderApi.detail(id.value)
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

async function run(fn: () => Promise<OrderDetail>, okText: string) {
  acting.value = true
  try {
    order.value = await fn()
    message.success(okText)
    await auth.refreshMe()
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    acting.value = false
  }
}

function pay() {
  if (!order.value) return
  /* 幂等键：同一订单重复点击不会重复生成支付流水 */
  const key = `pay-${order.value.id}-${crypto.randomUUID()}`
  void run(() => orderApi.pay(order.value!.id, key).then(() => orderApi.detail(id.value)), '支付成功')
}

function cancel() {
  Modal.confirm({
    title: '取消订单',
    content: '取消后房源会重新释放，确认取消吗？',
    okText: '确认取消',
    cancelText: '再想想',
    onOk: () => run(() => orderApi.cancel(order.value!.id), '订单已取消'),
  })
}

function reject() {
  let reason = ''
  Modal.confirm({
    title: '拒单原因',
    content: () =>
      h('input', {
        class: 'ant-input',
        placeholder: '请填写拒单原因（不超过 100 字）',
        onInput: (e: Event) => {
          reason = (e.target as HTMLInputElement).value
        },
      }),
    okText: '确认拒单',
    cancelText: '取消',
    onOk: () => run(() => orderApi.reject(order.value!.id, reason), '已拒单'),
  })
}

function confirmOrder() {
  if (order.value) void run(() => orderApi.confirm(order.value!.id), '已接单')
}

function completeOrder() {
  if (order.value) void run(() => orderApi.complete(order.value!.id), '订单已完成')
}

onMounted(load)
</script>

<template>
  <a-spin :spinning="loading">
    <a-result v-if="!order && !loading" status="404" title="订单不存在" />

    <div v-else-if="order">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px">
        <div>
          <h1 style="font-size: 22px; margin: 0">订单 {{ order.order_no }}</h1>
          <div class="rh-muted" style="margin-top: 4px">下单时间 {{ dateTime(order.created_at) }}</div>
        </div>
        <a-tag :color="status?.color" style="font-size: 14px; padding: 2px 10px">{{ status?.text }}</a-tag>
      </div>

      <a-row :gutter="20" style="margin-top: 18px">
        <a-col :xs="24" :md="15">
          <a-card title="房源快照">
            <a-space align="start">
              <img :src="order.cover" alt="" style="width: 160px; height: 120px; object-fit: cover; border-radius: 6px" />
              <div>
                <div style="font-weight: 600; font-size: 16px">{{ order.listing_title }}</div>
                <div class="rh-muted" style="margin-top: 6px">
                  {{ String(order.snapshot?.layout ?? '') }} · {{ String(order.snapshot?.regionName ?? '') }}
                </div>
                <div class="rh-muted">入住 {{ order.check_in_date }} · 租期 {{ order.months }} 个月</div>
                <a-button size="small" style="margin-top: 8px" @click="$router.push(`/listings/${String(order.snapshot?.listingId ?? '')}`)">
                  查看房源
                </a-button>
              </div>
            </a-space>
          </a-card>

          <a-card title="状态流水" style="margin-top: 16px">
            <a-timeline>
              <a-timeline-item v-for="(log, i) in order.logs" :key="i" :color="i === order.logs.length - 1 ? 'blue' : 'gray'">
                <div>
                  {{ log.from_status ? `${ORDER_STATUS[log.from_status]?.text} → ` : '' }}{{ ORDER_STATUS[log.to_status]?.text }}
                  <span class="rh-muted">· {{ log.operator_name }} · {{ dateTime(log.created_at) }}</span>
                </div>
                <div v-if="log.reason" class="rh-muted">原因：{{ log.reason }}</div>
              </a-timeline-item>
            </a-timeline>
          </a-card>

          <a-card title="支付流水" style="margin-top: 16px">
            <a-empty v-if="!order.payments.length" description="暂无支付流水" />
            <a-list v-else size="small" :data-source="order.payments">
              <template #renderItem="{ item }">
                <a-list-item>
                  <span>{{ item.type === 'pay' ? '支付' : '退款' }}</span>
                  <span class="rh-muted">{{ item.trade_no }}</span>
                  <span class="rh-price">{{ money(item.amount) }} 元</span>
                  <span class="rh-muted">{{ dateTime(item.created_at) }}</span>
                </a-list-item>
              </template>
            </a-list>
          </a-card>
        </a-col>

        <a-col :xs="24" :md="9">
          <a-card title="金额">
            <a-descriptions :column="1" size="small">
              <a-descriptions-item label="月租">{{ money(order.rent) }} 元</a-descriptions-item>
              <a-descriptions-item label="租期">{{ order.months }} 个月</a-descriptions-item>
              <a-descriptions-item label="押金">{{ money(order.deposit) }} 元</a-descriptions-item>
              <a-descriptions-item label="服务费">{{ money(order.service_fee) }} 元</a-descriptions-item>
            </a-descriptions>
            <a-divider style="margin: 12px 0" />
            <div style="display: flex; justify-content: space-between; align-items: baseline">
              <span class="rh-muted">合计</span>
              <span class="rh-price" style="font-size: 22px">{{ money(order.total_amount) }} 元</span>
            </div>

            <a-space direction="vertical" style="width: 100%; margin-top: 16px">
              <a-button v-if="order.can_pay" type="primary" block :loading="acting" @click="pay">
                模拟支付 {{ money(order.total_amount) }} 元
              </a-button>
              <a-button v-if="order.can_confirm" type="primary" block :loading="acting" @click="confirmOrder">
                接单
              </a-button>
              <a-button v-if="order.can_complete" block :loading="acting" @click="completeOrder">
                标记完成
              </a-button>
              <a-button v-if="order.can_reject" danger block :loading="acting" @click="reject">拒单</a-button>
              <a-button v-if="order.can_cancel" block :loading="acting" @click="cancel">取消订单</a-button>
            </a-space>
            <div v-if="order.reason" class="rh-muted" style="margin-top: 12px">原因：{{ order.reason }}</div>
          </a-card>
        </a-col>
      </a-row>
    </div>
  </a-spin>
</template>
