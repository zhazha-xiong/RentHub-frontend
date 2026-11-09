<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { favoriteApi, listingApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useMetaStore } from '@/stores/meta'
import type { ListingCard, ListingQuery, Sort } from '@/api/types'
import { money } from '@/utils/format'

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
  hasElevator: false,
  nearMetro: false,
  sort: 'composite' as Sort,
})

const items = ref<ListingCard[]>([])
const cursor = ref<string | null>(null)
const total = ref(0)
const loading = ref(false)
const loaded = ref(false)
const favorited = ref<Set<number>>(new Set())
const sentinel = ref<HTMLElement | null>(null)

let io: IntersectionObserver | null = null
let reloadTimer: ReturnType<typeof setTimeout> | null = null

const rentOptions = computed(() =>
  (meta.filters?.rent_buckets ?? []).map((b, i) => ({
    i,
    label: b.max == null ? `${money(b.min)} 元以上` : `${money(b.min)}–${money(b.max)} 元`,
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

/** 瀑布流的错落感：不同比例（旧版靠图片真实比例，这里按 id 轮换） */
function cardAspect(id: number): string {
  const all = ['4 / 3', '3 / 2', '1 / 1', '4 / 5']
  return all[id % all.length]
}

function buildQuery(next?: string): ListingQuery {
  const q: ListingQuery = { sort: filters.sort, limit: 12 }
  if (filters.keyword.trim()) q.keyword = filters.keyword.trim()
  if (filters.region) q.region = filters.region
  if (filters.metro) q.metro_line = filters.metro
  if (filters.rentBucket !== undefined) {
    const bucket = meta.filters?.rent_buckets[filters.rentBucket]
    if (bucket) {
      q.rent_min = bucket.min
      if (bucket.max != null) q.rent_max = bucket.max
    }
  }
  if (filters.rooms) q.rooms = String(filters.rooms)
  if (filters.rentType) q.rent_type = filters.rentType
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
    filters.hasElevator,
    filters.nearMetro,
    filters.sort,
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
function resetFilters() {
  filters.keyword = ''
  filters.region = undefined
  filters.metro = undefined
  filters.rentBucket = undefined
  filters.rooms = undefined
  filters.rentType = undefined
  filters.orientation = undefined
  filters.hasElevator = false
  filters.nearMetro = false
  filters.sort = 'composite'
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
    <form class="search" role="search" @submit.prevent="scheduleReload">
      <input
        v-model="filters.keyword"
        type="search"
        placeholder="搜索小区、地址或描述，例如「星海广场」"
        aria-label="搜索房源"
      />
      <button class="btn" type="submit">搜索</button>
      <router-link class="btn" to="/ai" style="display: inline-flex; align-items: center; text-decoration: none">问 AI</router-link>
    </form>

    <section class="filters" aria-label="筛选">
      <div class="frow">
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
        <div class="fvals">
          <button class="opt" :class="{ 'is-on': filters.rentBucket === undefined }" @click="filters.rentBucket = undefined">全部租金</button>
          <button
            v-for="b in rentOptions"
            :key="b.i"
            class="opt"
            :class="{ 'is-on': filters.rentBucket === b.i }"
            @click="filters.rentBucket = filters.rentBucket === b.i ? undefined : b.i"
          >
            {{ b.label }}
          </button>
        </div>
      </div>

      <div class="frow">
        <div class="fvals">
          <button class="opt" :class="{ 'is-on': filters.rooms === undefined }" @click="filters.rooms = undefined">全部户型</button>
          <button v-for="r in roomOptions" :key="r.v" class="opt" :class="{ 'is-on': filters.rooms === r.v }" @click="pickRoom(r.v)">
            {{ r.label }}
          </button>
        </div>
      </div>

      <div class="frow">
        <div class="fvals">
          <button class="opt" :class="{ 'is-on': !filters.rentType }" @click="filters.rentType = undefined">全部类型</button>
          <button class="opt" :class="{ 'is-on': filters.rentType === 'whole' }" @click="filters.rentType = filters.rentType === 'whole' ? undefined : 'whole'">整租</button>
          <button class="opt" :class="{ 'is-on': filters.rentType === 'shared' }" @click="filters.rentType = filters.rentType === 'shared' ? undefined : 'shared'">合租/单间</button>
        </div>
      </div>

      <div class="frow">
        <div class="fvals">
          <button class="opt" :class="{ 'is-on': !filters.orientation }" @click="filters.orientation = undefined">全部朝向</button>
          <button
            v-for="o in (meta.filters?.orientations ?? []).slice(0, 6)"
            :key="o.code"
            class="opt"
            :class="{ 'is-on': filters.orientation === o.code }"
            @click="filters.orientation = filters.orientation === o.code ? undefined : o.code"
          >
            {{ o.name }}
          </button>
          <button class="opt" :class="{ 'is-on': filters.hasElevator }" @click="filters.hasElevator = !filters.hasElevator">电梯房</button>
          <button class="opt" :class="{ 'is-on': filters.nearMetro }" @click="filters.nearMetro = !filters.nearMetro">近地铁</button>
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
      <span class="note">{{ total }} 套在架</span>
    </div>

    <section class="masonry" aria-label="房源列表">
      <template v-if="loaded">
        <router-link v-for="item in items" :key="item.id" class="card" :to="`/listings/${item.id}`">
          <div class="thumb" :style="{ aspectRatio: cardAspect(item.id) }">
            <img :src="item.cover" :alt="`${item.title} 实拍图`" loading="lazy" />
            <button
              class="fav"
              type="button"
              :aria-label="favorited.has(item.id) ? '取消收藏' : '收藏'"
              :class="{ 'is-on': favorited.has(item.id) }"
              @click.prevent.stop="toggleFavorite(item)"
            >
              {{ favorited.has(item.id) ? '♥' : '♡' }}
            </button>
          </div>
          <div class="card-body">
            <h3 class="card-title">{{ item.title }}</h3>
            <p class="card-meta">{{ item.region_name }} · {{ item.layout }} · {{ item.area }}㎡ · {{ item.floor_desc }}</p>
            <p class="card-tags">
              <span v-for="tag in item.tags.slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
            </p>
            <div class="card-foot">
              <span class="price"><b>{{ money(item.rent) }}</b> 元/月</span>
              <span class="when">可租</span>
            </div>
          </div>
        </router-link>
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
