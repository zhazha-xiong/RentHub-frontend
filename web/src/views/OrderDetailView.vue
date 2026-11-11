<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { orderApi } from '@/api'
import type { OrderDetail } from '@/api/types'
import { ORDER_STATUS, dateTime, money, ORDER_TAG as STATUS_TAG } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

/**
 * 订单详情 —— 沿用 v2 的页面骨架：
 *   .crumbs → .head（订单号 + 状态）→ .split（左：房源快照 .order + 两张 .table；右：.summary 金额与操作）
 * v2 没有独立的订单详情页，这里用的是 v2 已有的 .split / .order / .table / .summary 组合。
 */
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

/** 快照字段是 Record<string, unknown>，统一走这个取字符串 */
function snap(key: string): string {
  const v = order.value?.snapshot?.[key]
  return v == null ? '' : String(v)
}

onMounted(load)
</script>

<template>
  <div>
    <p v-if="order" class="crumbs">
      <router-link to="/orders">我的订单</router-link><span>/</span>{{ order.order_no }}
    </p>

    <p v-if="loading" class="loading-hint">正在加载订单…</p>
    <p v-else-if="!order" class="empty">订单不存在，<router-link to="/orders">回到订单列表</router-link></p>

    <template v-else>
      <div class="head">
        <div>
          <h1>订单 {{ order.order_no }}</h1>
          <p class="sub">下单时间 {{ dateTime(order.created_at) }}</p>
        </div>
        <div class="right">
          <span :class="STATUS_TAG[order.status] ?? 'tag'">{{ status?.text ?? order.status }}</span>
        </div>
      </div>

      <div class="split">
        <div>
          <div class="fieldset">
            <h2>房源快照</h2>
            <article class="order" style="margin-top: 0">
              <div class="body">
                <img :src="order.cover" :alt="order.listing_title" loading="lazy" />
                <div>
                  <p class="t">{{ order.listing_title || snap('title') }}</p>
                  <p class="m">{{ snap('regionName') }}<template v-if="snap('layout')"> · {{ snap('layout') }}</template></p>
                  <p class="m">入住 {{ order.check_in_date }} · 租期 {{ order.months }} 个月</p>
                </div>
                <div class="amt">
                  <b>{{ money(order.total_amount) }}</b>
                  <p>含押金 {{ money(order.deposit) }}</p>
                </div>
              </div>
              <div class="foot">
                <router-link
                  v-if="snap('listingId')"
                  class="btn ghost sm"
                  :to="`/listings/${snap('listingId')}`"
                  style="text-decoration: none; display: inline-flex; align-items: center"
                >
                  查看房源
                </router-link>
              </div>
            </article>
          </div>

          <div class="panel">
            <h2>状态流水</h2>
            <table class="table">
              <thead>
                <tr><th>时间</th><th>变更</th><th>操作人</th><th>原因</th></tr>
              </thead>
              <tbody>
                <tr v-for="(log, i) in order.logs" :key="i">
                  <td>{{ dateTime(log.created_at) }}</td>
                  <td>
                    <span class="tag">{{ ORDER_STATUS[log.to_status]?.text ?? log.to_status }}</span>
                    <span v-if="log.from_status" class="m" style="margin-left: 6px; color: var(--text-3)">
                      原 {{ ORDER_STATUS[log.from_status]?.text ?? log.from_status }}
                    </span>
                  </td>
                  <td>{{ log.operator_name }}</td>
                  <td class="m">{{ log.reason || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="panel">
            <h2>支付流水</h2>
            <p v-if="!order.payments.length" class="hint">暂无支付流水。</p>
            <table v-else class="table">
              <thead>
                <tr><th>时间</th><th>类型</th><th>交易号</th><th class="num">金额</th></tr>
              </thead>
              <tbody>
                <tr v-for="p in order.payments" :key="p.id">
                  <td>{{ dateTime(p.created_at) }}</td>
                  <td>{{ p.type === 'pay' ? '支付' : '退款' }}</td>
                  <td class="m">{{ p.trade_no }}</td>
                  <td class="num">{{ money(p.amount) }} 元</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <aside class="summary">
          <h2>金额</h2>
          <div class="row"><span>月租</span><b>{{ money(order.rent) }}</b></div>
          <div class="row"><span>租期</span><b>{{ order.months }} 个月</b></div>
          <div class="row"><span>押金</span><b>{{ money(order.deposit) }}</b></div>
          <div class="row"><span>服务费</span><b>{{ money(order.service_fee) }}</b></div>
          <div class="total"><span>合计</span><b>{{ money(order.total_amount) }}</b></div>

          <button v-if="order.can_pay" class="btn" type="button" :disabled="acting" @click="pay">
            模拟支付 {{ money(order.total_amount) }} 元
          </button>
          <button v-if="order.can_confirm" class="btn" type="button" :disabled="acting" @click="confirmOrder">接单</button>
          <button v-if="order.can_complete" class="btn ghost" type="button" :disabled="acting" @click="completeOrder">标记完成</button>
          <button v-if="order.can_reject" class="btn ghost" type="button" :disabled="acting" @click="reject">拒单</button>
          <button v-if="order.can_cancel" class="btn ghost" type="button" :disabled="acting" @click="cancel">取消订单</button>

          <p v-if="order.reason" class="fine">原因：{{ order.reason }}</p>
          <p v-if="!order.can_pay && !order.can_confirm && !order.can_complete && !order.can_reject && !order.can_cancel" class="fine">
            当前状态没有可执行的操作。
          </p>
        </aside>
      </div>
    </template>
  </div>
</template>
