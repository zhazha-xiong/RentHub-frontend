<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { favoriteApi, listingApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useMetaStore } from '@/stores/meta'
import type { ListingCard, ListingQuery, Sort } from '@/api/types'
import { money } from '@/utils/format'
import ListingCardView from '@/components/ListingCard.vue'

/**
 * 找房首页 —— 结构和 class 完全沿用旧版 index.html：
 *   .search（关键词 + 问 AI）→ .filters（区域/地铁/租金/房型/类型/朝向/电梯）
 *   → .sortbar（排序 + 结果数）→ .masonry（CSS columns 瀑布流，.card 断行保护）
 * 数据来自 /api/v1，滚动到底自动加载下一页（游标分页）。
 */
const meta = useMetaStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const filters = reactive({
  mode: 'region' as 'region' | 'metro',
  keyword: '',
  region: undefined as string | undefined,
  metro: undefined as string | undefined,
  rentBucket: undefined as number | undefined,
  rooms: undefined as number | undefined,
  rentType: undefined as 'whole' | 'shared' | undefined,
  orientation: undefined as string | undefined,
  houseType: undefined as string | undefined,
  hasElevator: false,
  nearMetro: false,
  sort: 'composite' as Sort,
})

/* 手填租金（元）：与上面的区间按钮互斥，v2 的「最低 – 最高 元」就是走这里 */
const rentMinText = ref('')
const rentMaxText = ref('')

const rentRangeDirty = computed(() => rentMinText.value.trim() !== '' || rentMaxText.value.trim() !== '')

const items = ref<ListingCard[]>([])
const cursor = ref<string | null>(null)
const total = ref(0)
/** 全站在架数与今日新上：由后端 stats 给（v2 右侧那行 note） */
const onlineTotal = ref(0)
const todayNew = ref(0)
const loading = ref(false)
const loaded = ref(false)
const favorited = ref<Set<number>>(new Set())
const sentinel = ref<HTMLElement | null>(null)

let io: IntersectionObserver | null = null
let reloadTimer: ReturnType<typeof setTimeout> | null = null

const rentOptions = computed(() =>
  (meta.filters?.rent_buckets ?? []).map((b, i) => ({
    i,
    /* 文案对齐 v2：「500 元以下」「500–800 元」「5000 元以上」 */
    label: b.max == null ? `${money(b.min)} 元以上` : b.min === 0 ? `${money(b.max)} 元以下` : `${money(b.min)}–${money(b.max)} 元`,
  })),
)
const roomOptions = [
  { v: 1, label: '一室' },
  { v: 2, label: '二室' },
  { v: 3, label: '三室' },
  { v: 4, label: '四室' },
  { v: 5, label: '五室及以上' },
]
const sorts: { value: Sort; label: string }[] = [
  { value: 'composite', label: '综合' },
  { value: 'latest', label: '最新' },
  { value: 'price_asc', label: '价格 ↑' },
  { value: 'price_desc', label: '价格 ↓' },
]

function buildQuery(next?: string): ListingQuery {
  const q: ListingQuery = { sort: filters.sort, limit: 12 }
  if (filters.keyword.trim()) q.keyword = filters.keyword.trim()
  if (filters.region) q.region = filters.region
  if (filters.metro) q.metro_line = filters.metro
  /* 手填区间优先于区间按钮（两者互斥，见 pickRentBucket / clearRent） */
  if (rentRangeDirty.value) {
    const min = Number(rentMinText.value)
    const max = Number(rentMaxText.value)
    if (rentMinText.value.trim() && !Number.isNaN(min)) q.rent_min = Math.round(min * 100)
    if (rentMaxText.value.trim() && !Number.isNaN(max)) q.rent_max = Math.round(max * 100)
  } else if (filters.rentBucket !== undefined) {
    const bucket = meta.filters?.rent_buckets[filters.rentBucket]
    if (bucket) {
      q.rent_min = bucket.min
      if (bucket.max != null) q.rent_max = bucket.max
    }
  }
  if (filters.rooms) q.rooms = String(filters.rooms)
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
    if (reset) {
      total.value = (data as { total?: number }).total ?? data.items.length
      const stats = (data as { stats?: { total?: number; today_new?: number } }).stats
      onlineTotal.value = stats?.total ?? total.value
      todayNew.value = stats?.today_new ?? 0
      loaded.value = true
      window.scrollTo({ top: 0 })
    }
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => void load(true), 260)
}

watch(
  () => [
    filters.keyword,
    filters.region,
    filters.metro,
    filters.rentBucket,
    filters.rooms,
    filters.rentType,
    filters.orientation,
    filters.houseType,
    filters.hasElevator,
    filters.nearMetro,
    filters.sort,
    rentMinText.value,
    rentMaxText.value,
  ],
  scheduleReload,
  { deep: true },
)

/* 区域与地铁互斥（技术文档 5.2 的约束），切 tab 时清另一个 */
watch(
  () => filters.mode,
  (mode) => {
    if (mode === 'region') filters.metro = undefined
    else filters.region = undefined
    scheduleReload()
  },
)

function pickRegion(code?: string) {
  filters.region = filters.region === code ? undefined : code
}
function pickMetro(code?: string) {
  filters.metro = filters.metro === code ? undefined : code
}
function pickRoom(v?: number) {
  filters.rooms = filters.rooms === v ? undefined : v
}
/** 区间按钮与手填租金互斥：点按钮就清空手填，反之手填补上就清空按钮 */
function pickRentBucket(i: number) {
  filters.rentBucket = filters.rentBucket === i ? undefined : i
  if (filters.rentBucket !== undefined) {
    rentMinText.value = ''
    rentMaxText.value = ''
  }
}
function clearRent() {
  filters.rentBucket = undefined
  rentMinText.value = ''
  rentMaxText.value = ''
}
function resetFilters() {
  filters.keyword = ''
  filters.region = undefined
  filters.metro = undefined
  filters.rentBucket = undefined
  filters.rooms = undefined
  filters.rentType = undefined
  filters.orientation = undefined
  filters.houseType = undefined
  filters.hasElevator = false
  filters.nearMetro = false
  filters.sort = 'composite'
  rentMinText.value = ''
  rentMaxText.value = ''
}

async function toggleFavorite(item: ListingCard) {
  if (!auth.isLoggedIn) {
    await router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  try {
    const on = !favorited.value.has(item.id)
    await favoriteApi.toggle(item.id, on)
    const next = new Set(favorited.value)
    if (on) next.add(item.id)
    else next.delete(item.id)
    favorited.value = next
    auth.setCounts({ favorites: Math.max(0, auth.counts.favorites + (on ? 1 : -1)) })
    message.success(on ? '已加入收藏' : '已取消收藏')
  } catch (err) {
    message.error((err as Error).message)
  }
}

onMounted(async () => {
  await meta.ensure()
  await load(true)
  io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting) && cursor.value && !loading.value) void load(false)
    },
    { rootMargin: '400px 0px' },
  )
  if (sentinel.value) io.observe(sentinel.value)
})

onBeforeUnmount(() => {
  io?.disconnect()
  if (reloadTimer) clearTimeout(reloadTimer)
})
</script>

<template>
  <div>
    <h1>大连租房</h1>

    <!-- v2：一句话描述 + 问 AI（回车即按关键词筛选，功能不丢） -->
    <form class="search" role="search" @submit.prevent="scheduleReload">
      <input
        v-model="filters.keyword"
        type="search"
        aria-label="用一句话描述你想找的房子"
        placeholder="说说你想住哪儿，例如「沙河口 两室 3000 以内 有电梯」"
      />
      <router-link class="btn" to="/ai" style="display: inline-flex; align-items: center; text-decoration: none">问 AI</router-link>
    </form>

    <section class="filters" aria-label="筛选">
      <div class="frow">
        <span class="flabel">位置</span>
        <div class="modes" role="tablist" aria-label="位置方式">
          <button class="mode" :class="{ 'is-on': filters.mode === 'region' }" role="tab" :aria-selected="filters.mode === 'region'" @click="filters.mode = 'region'">区域</button>
          <button class="mode" :class="{ 'is-on': filters.mode === 'metro' }" role="tab" :aria-selected="filters.mode === 'metro'" @click="filters.mode = 'metro'">地铁</button>
        </div>
        <div v-show="filters.mode === 'region'" class="fvals">
          <button class="opt" :class="{ 'is-on': !filters.region }" @click="pickRegion(undefined)">全部</button>
          <button
            v-for="r in meta.filters?.regions ?? []"
            :key="r.code"
            class="opt"
            :class="{ 'is-on': filters.region === r.code }"
            @click="pickRegion(r.code)"
          >
            {{ r.name }}
          </button>
        </div>
        <div v-show="filters.mode === 'metro'" class="fvals">
          <button class="opt" :class="{ 'is-on': !filters.metro }" @click="pickMetro(undefined)">全部</button>
          <button
            v-for="m in meta.filters?.metro_lines ?? []"
            :key="m.code"
            class="opt"
            :class="{ 'is-on': filters.metro === m.code }"
            @click="pickMetro(m.code)"
          >
            {{ m.name }}
          </button>
        </div>
      </div>

      <div class="frow">
        <span class="flabel">租金</span>
        <div class="fvals">
          <button class="opt" :class="{ 'is-on': filters.rentBucket === undefined && !rentRangeDirty }" @click="clearRent">全部</button>
          <button
            v-for="b in rentOptions"
            :key="b.i"
            class="opt"
            :class="{ 'is-on': filters.rentBucket === b.i }"
            @click="pickRentBucket(b.i)"
          >
            {{ b.label }}
          </button>
          <span class="range">
            <input v-model="rentMinText" type="text" inputmode="numeric" aria-label="最低租金" placeholder="最低" />
            –
            <input v-model="rentMaxText" type="text" inputmode="numeric" aria-label="最高租金" placeholder="最高" />
            元
          </span>
        </div>
      </div>

      <div class="frow">
        <span class="flabel">房型</span>
        <div class="fvals">
          <button class="opt" :class="{ 'is-on': filters.rooms === undefined }" @click="filters.rooms = undefined">全部</button>
          <button v-for="r in roomOptions" :key="r.v" class="opt" :class="{ 'is-on': filters.rooms === r.v }" @click="pickRoom(r.v)">
            {{ r.label }}
          </button>
        </div>
      </div>

      <div class="frow">
        <span class="flabel">类型</span>
        <div class="fvals">
          <button class="opt" :class="{ 'is-on': !filters.rentType }" @click="filters.rentType = undefined">全部</button>
          <button class="opt" :class="{ 'is-on': filters.rentType === 'whole' }" @click="filters.rentType = filters.rentType === 'whole' ? undefined : 'whole'">整租</button>
          <button class="opt" :class="{ 'is-on': filters.rentType === 'shared' }" @click="filters.rentType = filters.rentType === 'shared' ? undefined : 'shared'">合租/单间</button>
        </div>
      </div>

      <div class="frow">
        <span class="flabel">更多</span>
        <div class="fvals">
          <select v-model="filters.houseType" class="select-sm" aria-label="房屋类型">
            <option :value="undefined">房屋类型</option>
            <option v-for="h in meta.filters?.house_types ?? []" :key="h.code" :value="h.code">{{ h.name }}</option>
          </select>
          <select v-model="filters.orientation" class="select-sm" aria-label="朝向">
            <option :value="undefined">朝向</option>
            <option v-for="o in meta.filters?.orientations ?? []" :key="o.code" :value="o.code">{{ o.name }}</option>
          </select>
          <label class="check"><input v-model="filters.hasElevator" type="checkbox" /> 电梯房</label>
          <label class="check"><input v-model="filters.nearMetro" type="checkbox" /> 近地铁</label>
          <button class="opt" @click="resetFilters">重置</button>
        </div>
      </div>
    </section>

    <div class="sortbar">
      <div class="sorts">
        <button v-for="s in sorts" :key="s.value" class="sort" :class="{ 'is-on': filters.sort === s.value }" :aria-pressed="filters.sort === s.value" @click="filters.sort = s.value">
          {{ s.label }}
        </button>
      </div>
      <p class="note">{{ onlineTotal }} 套在架 · 今日新上 {{ todayNew }} 套</p>
    </div>

    <section class="masonry" aria-label="房源列表">
      <template v-if="loaded">
        <ListingCardView
          v-for="item in items"
          :key="item.id"
          :listing="item"
          :favorited="favorited.has(item.id)"
          @toggle-favorite="toggleFavorite"
        />
      </template>

      <template v-else>
        <div v-for="i in 6" :key="i" class="skeleton-card">
          <div class="sk-img" />
          <div class="sk-line" />
          <div class="sk-line short" />
        </div>
      </template>
    </section>

    <div ref="sentinel" style="height: 1px" />
    <div v-if="loading" class="loading-hint">正在加载…</div>
    <div v-else-if="loaded && !items.length" class="loading-hint">没有符合条件的房源，试试放宽筛选条件</div>
    <div v-else-if="!cursor && items.length" class="loading-hint">已经到底了 · 共 {{ items.length }} 套</div>
  </div>
</template>
