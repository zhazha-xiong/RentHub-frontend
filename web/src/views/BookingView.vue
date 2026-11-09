<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { listingApi, orderApi } from '@/api'
import type { ListingDetail } from '@/api/types'
import { money, tomorrow } from '@/utils/format'

const route = useRoute()
const router = useRouter()

const listing = ref<ListingDetail | null>(null)
const loading = ref(true)
const submitting = ref(false)

const form = reactive({ months: 12, check_in_date: tomorrow() })

const rate = computed(() => listing.value?.price.service_fee_rate ?? 0.05)
const rent = computed(() => listing.value?.rent ?? 0)
const deposit = computed(() => listing.value?.price.deposit ?? 0)
const serviceFee = computed(() => Math.round(rent.value * rate.value * form.months))
const total = computed(() => rent.value * form.months + deposit.value + serviceFee.value)

const monthOptions = [1, 3, 6, 12, 24].map((m) => ({ value: m, label: `${m} 个月` }))

onMounted(async () => {
  try {
    listing.value = await listingApi.detail(String(route.params.id))
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
  <a-spin :spinning="loading">
    <div v-if="listing">
      <h1 style="font-size: 22px; margin: 0 0 4px">确认订单</h1>
      <div class="rh-muted" style="margin-bottom: 18px">提交后房源会被锁定，等待商家确认</div>

      <a-row :gutter="20">
        <a-col :xs="24" :md="15">
          <a-card title="租约信息">
            <a-form layout="vertical" :model="form">
              <a-form-item label="租期">
                <a-radio-group v-model:value="form.months" button-style="solid">
                  <a-radio-button v-for="m in monthOptions" :key="m.value" :value="m.value">{{ m.label }}</a-radio-button>
                </a-radio-group>
              </a-form-item>
              <a-form-item label="入住日期（次日 ~ 90 天内）">
                <a-input v-model:value="form.check_in_date" type="date" style="max-width: 220px" />
              </a-form-item>
              <a-form-item label="房源">
                <a-space>
                  <img :src="listing.images[0]" alt="" style="width: 96px; height: 72px; object-fit: cover; border-radius: 6px" />
                  <div>
                    <div style="font-weight: 600">{{ listing.title }}</div>
                    <div class="rh-muted">{{ listing.region_name }} · {{ listing.layout }} · {{ listing.area }}㎡</div>
                    <div class="rh-muted">商家：{{ listing.merchant.name }}</div>
                  </div>
                </a-space>
              </a-form-item>
            </a-form>
          </a-card>
        </a-col>

        <a-col :xs="24" :md="9">
          <a-card title="费用明细">
            <a-descriptions :column="1" size="small">
              <a-descriptions-item label="月租">{{ money(rent) }} 元</a-descriptions-item>
              <a-descriptions-item label="租期">{{ form.months }} 个月</a-descriptions-item>
              <a-descriptions-item label="押金">{{ money(deposit) }} 元</a-descriptions-item>
              <a-descriptions-item label="服务费（{{ (rate * 100).toFixed(0) }}%）">{{ money(serviceFee) }} 元</a-descriptions-item>
            </a-descriptions>
            <a-divider style="margin: 12px 0" />
            <div style="display: flex; align-items: baseline; justify-content: space-between">
              <span class="rh-muted">合计</span>
              <span class="rh-price" style="font-size: 24px">{{ money(total) }} 元</span>
            </div>
            <a-button type="primary" size="large" block style="margin-top: 16px" :loading="submitting" @click="submit">
              提交订单
            </a-button>
            <div class="rh-muted" style="margin-top: 10px">提交后可在「我的订单」里支付、取消或查看状态流水。</div>
          </a-card>
        </a-col>
      </a-row>
    </div>
  </a-spin>
</template>
