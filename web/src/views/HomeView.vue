<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { listingApi } from '@/api'
import { useMetaStore } from '@/stores/meta'
import ListingCard from '@/components/ListingCard.vue'
import type { ListingCard as CardItem, ListingQuery, Sort } from '@/api/types'

const meta = useMetaStore()

const filters = reactive({
  keyword: '',
  region: [] as string[],
  metro: undefined as string | undefined,
  rentBucket: undefined as number | undefined,
  rooms: [] as number[],
  rentType: undefined as 'whole' | 'shared' | undefined,
  houseType: undefined as string | undefined,
  orientation: undefined as string | undefined,
  hasElevator: false,
  nearMetro: false,
  sort: 'composite' as Sort,
})

const items = ref<CardItem[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false)
const total = ref(0)

const rentOptions = computed(() =>
  (meta.filters?.rent_buckets ?? []).map((b, i) => ({
    value: i,
    label: b.max == null ? `${b.min / 100} 元以上` : `${b.min / 100}–${b.max / 100} 元`,
  })),
)

const roomOptions = [
  { value: 1, label: '一室' },
  { value: 2, label: '二室' },
  { value: 3, label: '三室' },
  { value: 4, label: '四室' },
  { value: 5, label: '五室及以上' },
]

function buildQuery(next?: string): ListingQuery {
  const q: ListingQuery = { sort: filters.sort, limit: 12 }
  if (filters.keyword.trim()) q.keyword = filters.keyword.trim()
  if (filters.metro) q.metro_line = filters.metro
  else if (filters.region.length) q.region = filters.region.join(',')
  if (filters.rentBucket !== undefined) {
    const bucket = meta.filters?.rent_buckets[filters.rentBucket]
    if (bucket) {
      q.rent_min = bucket.min
      if (bucket.max != null) q.rent_max = bucket.max
    }
  }
  if (filters.rooms.length) q.rooms = filters.rooms.join(',')
  if (filters.rentType) q.rent_type = filters.rentType
  if (filters.houseType) q.house_type = filters.houseType
  if (filters.orientation) q.orientation = filters.orientation
  if (filters.hasElevator) q.has_elevator = true
  if (filters.nearMetro) q.near_metro = true
  if (next) q.cursor = next
  return q
}

async function load(reset = true) {
  if (loading.value) return
  loading.value = true
  try {
    const data = await listingApi.list(buildQuery(reset ? undefined : cursor.value ?? undefined))
    items.value = reset ? data.items : [...items.value, ...data.items]
    cursor.value = data.next_cursor
    if (reset) total.value = (data as { total?: number }).total ?? data.items.length
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

function reset() {
  filters.keyword = ''
  filters.region = []
  filters.metro = undefined
  filters.rentBucket = undefined
  filters.rooms = []
  filters.rentType = undefined
  filters.houseType = undefined
  filters.orientation = undefined
  filters.hasElevator = false
  filters.nearMetro = false
  filters.sort = 'composite'
}

/* 地铁与区域互斥：选一个就清另一个（对齐技术文档 5.2 的约束） */
watch(
  () => filters.metro,
  (v) => {
    if (v) filters.region = []
  },
)
watch(
  () => filters.region,
  (v) => {
    if (v.length) filters.metro = undefined
  },
)

/* 筛选变化后 260ms 再请求：避免关键词逐字输入时打出一串请求 */
let reloadTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => [filters.keyword, filters.region, filters.metro, filters.rentBucket, filters.rooms, filters.rentType, filters.houseType, filters.orientation, filters.hasElevator, filters.nearMetro, filters.sort],
  () => {
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => void load(true), 260)
  },
  { deep: true },
)

onMounted(async () => {
  await meta.ensure()
  await load(true)
})
</script>

<template>
  <div>
    <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 16px">
      <div>
        <h1 style="margin: 0; font-size: 22px">大连租房</h1>
        <div class="rh-muted" style="margin-top: 4px">共 {{ total }} 套在架房源 · 支持区域 / 地铁 / 租金 / 户型筛选</div>
      </div>
      <a-button @click="reset">重置筛选</a-button>
    </div>

    <a-card :body-style="{ padding: 16 }" style="margin-bottom: 18px">
      <a-form layout="vertical" :model="filters">
        <a-row :gutter="[12, 0]">
          <a-col :xs="24" :sm="12" :md="6">
            <a-form-item label="关键词">
              <a-input v-model:value="filters.keyword" allow-clear placeholder="小区 / 地址 / 描述" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12" :md="6">
            <a-form-item label="区域">
              <a-select
                v-model:value="filters.region"
                mode="multiple"
                allow-clear
                :max-tag-count="1"
                placeholder="全部区域"
                :options="(meta.filters?.regions ?? []).map((r) => ({ value: r.code, label: r.name }))"
              />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12" :md="6">
            <a-form-item label="地铁线路（与区域互斥）">
              <a-select
                v-model:value="filters.metro"
                allow-clear
                placeholder="不限"
                :options="(meta.filters?.metro_lines ?? []).map((m) => ({ value: m.code, label: m.name }))"
              />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12" :md="6">
            <a-form-item label="租金">
              <a-select v-model:value="filters.rentBucket" allow-clear placeholder="不限" :options="rentOptions" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12" :md="6">
            <a-form-item label="户型">
              <a-select v-model:value="filters.rooms" mode="multiple" allow-clear :max-tag-count="1" placeholder="不限" :options="roomOptions" />
            </a-form-item>
          </a-col>
          <a-col :xs="12" :sm="12" :md="3">
            <a-form-item label="租赁类型">
              <a-select
                v-model:value="filters.rentType"
                allow-clear
                placeholder="不限"
                :options="[
                  { value: 'whole', label: '整租' },
                  { value: 'shared', label: '合租' },
                ]"
              />
            </a-form-item>
          </a-col>
          <a-col :xs="12" :sm="12" :md="3">
            <a-form-item label="房型">
              <a-select
                v-model:value="filters.houseType"
                allow-clear
                placeholder="不限"
                :options="(meta.filters?.house_types ?? []).map((h) => ({ value: h.code, label: h.name }))"
              />
            </a-form-item>
          </a-col>
          <a-col :xs="12" :sm="12" :md="3">
            <a-form-item label="朝向">
              <a-select
                v-model:value="filters.orientation"
                allow-clear
                placeholder="不限"
                :options="(meta.filters?.orientations ?? []).map((o) => ({ value: o.code, label: o.name }))"
              />
            </a-form-item>
          </a-col>
          <a-col :xs="12" :sm="12" :md="3">
            <a-form-item label="排序">
              <a-select
                v-model:value="filters.sort"
                :options="[
                  { value: 'composite', label: '综合' },
                  { value: 'latest', label: '最新' },
                  { value: 'price_asc', label: '价格 ↑' },
                  { value: 'price_desc', label: '价格 ↓' },
                ]"
              />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12" :md="6">
            <a-form-item label="其它">
              <a-space>
                <a-checkbox v-model:checked="filters.hasElevator">有电梯</a-checkbox>
                <a-checkbox v-model:checked="filters.nearMetro">近地铁</a-checkbox>
              </a-space>
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-card>

    <a-spin :spinning="loading">
      <div v-if="items.length" class="rh-grid">
        <ListingCard v-for="item in items" :key="item.id" :listing="item" />
      </div>
      <a-empty v-else class="rh-empty" description="没有符合条件的房源，试试放宽筛选条件" />

      <div v-if="cursor" style="text-align: center; margin-top: 20px">
        <a-button :loading="loading" @click="load(false)">加载更多</a-button>
      </div>
    </a-spin>
  </div>
</template>
