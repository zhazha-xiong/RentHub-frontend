<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { listingApi, orderApi } from '@/api'
import type { ListingDetail } from '@/api/types'
import { useAuthStore } from '@/stores/auth'
import { money, tomorrow } from '@/utils/format'

/**
 * 确认订单 —— 结构沿用 v2 booking.html：
 *   .crumbs → h1 → .form（左：房源 .order 卡 + 租约信息 .grid2；右：.summary 金额明细）
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const listing = ref<ListingDetail | null>(null)
const loading = ref(true)
const submitting = ref(false)

const form = reactive({ months: 12, check_in_date: tomorrow(), guests: 2, phone: '', note: '' })

const rate = computed(() => listing.value?.price.service_fee_rate ?? 0.05)
const rent = computed(() => listing.value?.rent ?? 0)
const deposit = computed(() => listing.value?.price.deposit ?? 0)
const serviceFee = computed(() => Math.round(rent.value * rate.value * form.months))
const total = computed(() => rent.value * form.months + deposit.value + serviceFee.value)

/** 后端接受 1~24 个月；v2 的选项就是 3/6/12/24，这里补全 1 个月的短租 */
const monthOptions = [1, 3, 6, 12, 24]

/** 房源那一行的 meta，顺序与 v2 一致：区域 · 面积 · 朝向 · 楼层 · 装修 */
const listingMeta = computed(() => {
  const d = listing.value
  if (!d) return ''
  return [d.region_name, `${d.area}㎡`, d.spec.orientation, d.floor_desc, d.spec.decoration].filter(Boolean).join(' · ')
})

onMounted(async () => {
  try {
    listing.value = await listingApi.detail(String(route.params.id))
    if (listing.value.spec.available_date) form.check_in_date = listing.value.spec.available_date
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
})

async function submit() {
  if (!listing.value) return
  submitting.value = true
  try {
    const order = await orderApi.create({
      listing_id: listing.value.id,
      months: form.months,
      check_in_date: form.check_in_date,
      guests: form.guests,
      phone: form.phone.trim() || undefined,
      note: form.note.trim() || undefined,
    })
    message.success(`订单已提交：${order.order_no}`)
    await router.replace(`/orders/${order.id}`)
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <p v-if="listing" class="crumbs">
      <router-link to="/">找房</router-link><span>/</span>
      <router-link :to="`/listings/${listing.id}`">{{ listing.title }}</router-link><span>/</span>确认订单
    </p>
    <h1>确认订单</h1>

    <p v-if="loading" class="loading-hint">正在加载房源…</p>
    <p v-else-if="!listing" class="empty">房源不存在或已下架，<router-link to="/">回到列表</router-link></p>

    <div v-else class="form">
      <div>
        <div class="fieldset">
          <h2>房源</h2>
          <div class="order">
            <div class="body">
              <img :src="listing.images[0]" :alt="listing.title" loading="lazy" />
              <div>
                <p class="t">{{ listing.title }}</p>
                <p class="m">{{ listingMeta }}</p>
                <p class="m">
                  商家：{{ listing.merchant.name }} · {{ listing.merchant.verified ? '资质已认证' : '资质未认证' }}
                </p>
              </div>
              <div class="amt">
                <b>{{ money(rent) }}</b>
                <p>押金 {{ money(deposit) }} 元</p>
              </div>
            </div>
          </div>
        </div>

        <div class="fieldset">
          <h2>租约信息</h2>
          <div class="grid2">
            <div class="field">
              <label for="months">租期</label>
              <select id="months" v-model.number="form.months">
                <option v-for="m in monthOptions" :key="m" :value="m">{{ m }} 个月</option>
              </select>
            </div>
            <div class="field">
              <label for="date">入住日期</label>
              <input id="date" v-model="form.check_in_date" type="date" />
            </div>
            <div class="field">
              <label for="guests">入住人数</label>
              <input id="guests" v-model.number="form.guests" type="number" min="1" max="8" />
            </div>
            <div class="field">
              <label for="phone">联系方式</label>
              <input id="phone" v-model="form.phone" type="text" :placeholder="auth.user?.phone ?? '手机号，便于商家联系'" />
            </div>
            <div class="field wide">
              <label for="note">备注（选填）</label>
              <textarea id="note" v-model="form.note" rows="3" placeholder="例如：希望能留一个书桌位，周末看房" />
            </div>
          </div>
          <p class="hint">可选的最早入住日期是 {{ listing.spec.available_date }}，最短租期 {{ listing.spec.min_lease_months }} 个月。</p>
        </div>

        <p class="hint">订单提交后房源会锁定，商家在 24 小时内确认；未确认前你可以随时取消，款项原路退回。</p>
      </div>

      <aside class="summary">
        <h2>金额明细</h2>
        <div class="row"><span>月租 {{ money(rent) }} × {{ form.months }} 个月</span><b>{{ money(rent * form.months) }}</b></div>
        <div class="row"><span>押金</span><b>{{ money(deposit) }}</b></div>
        <div class="row"><span>服务费（月租 {{ (rate * 100).toFixed(0) }}% × {{ form.months }} 个月）</span><b>{{ money(serviceFee) }}</b></div>
        <div class="total"><span>应付总额</span><b>{{ money(total) }}</b></div>
        <button class="btn" type="button" :disabled="submitting" @click="submit">
          {{ submitting ? '提交中…' : '提交订单' }}
        </button>
        <p class="fine">提交后可在「我的订单」里模拟支付、取消或查看状态流水。演示环境不接真实支付。</p>
      </aside>
    </div>
  </div>
</template>
