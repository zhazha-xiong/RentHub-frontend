<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { listingApi, merchantApi } from '@/api'
import { LISTING_STATUS, dateOnly, money, LISTING_TAG as STATUS_TAG } from '@/utils/format'

/**
 * 商家 · 房源管理 —— 结构沿用 v2 merchant-listings.html：
 *   .head（h1 + 新建房源）→ .toolbar（搜索 + 状态筛选 + 统计）→ table.table
 */
type Row = {
  id: number
  title: string
  cover: string
  layout: string
  area: number
  region_name: string
  orientation_name?: string
  rent: number
  status: string
  view_count: number
  favorite_count: number
  published_at: string | null
}


const router = useRouter()
const rows = ref<Row[]>([])
const counts = ref<Record<string, number>>({})
const loading = ref(true)
const statusFilter = ref('all')
const keyword = ref('')

const noteText = computed(
  () =>
    `${counts.value.all ?? 0} 套 · 在架 ${counts.value.online ?? 0} · 已出租 ${counts.value.rented ?? 0} · 已下架 ${counts.value.offline ?? 0}`,
)

async function load() {
  loading.value = true
  try {
    const data = await merchantApi.listings({
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      keyword: keyword.value.trim() || undefined,
    })
    rows.value = data.items as unknown as Row[]
    counts.value = data.counts
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

async function toggle(row: Row) {
  const next = row.status === 'online' ? 'offline' : 'online'
  try {
    await listingApi.setStatus(row.id, next)
    message.success(next === 'online' ? '已上架' : '已下架')
    await load()
  } catch (err) {
    message.error((err as Error).message)
  }
}

function confirmToggle(row: Row) {
  Modal.confirm({
    title: row.status === 'online' ? '下架该房源？' : '上架该房源？',
    content: row.status === 'online' ? '下架后租客将无法看到该房源。' : '上架需要资质已通过审核。',
    okText: '确认',
    cancelText: '取消',
    onOk: () => toggle(row),
  })
}

/** 已出租的房源不能上下架，只能去看它的订单 */
function canToggle(row: Row) {
  return row.status === 'online' || row.status === 'offline'
}

onMounted(load)
</script>

<template>
  <div>
    <div class="head">
      <div><h1>房源管理</h1></div>
      <div class="right">
        <button class="btn" type="button" @click="router.push('/merchant/listings/new')">新建房源</button>
      </div>
    </div>

    <div class="toolbar">
      <input
        v-model="keyword"
        type="search"
        placeholder="搜索房源标题或小区"
        aria-label="搜索房源"
        @keydown.enter.prevent="load()"
        @blur="load()"
      />
      <select v-model="statusFilter" class="select-sm" aria-label="状态筛选" @change="load">
        <option value="all">全部状态</option>
        <option value="online">在架</option>
        <option value="rented">已出租</option>
        <option value="offline">已下架</option>
        <option value="locked">已锁定</option>
      </select>
      <span class="grow" />
      <span class="note">{{ noteText }}</span>
    </div>

    <p v-if="loading && !rows.length" class="loading-hint">正在加载…</p>
    <p v-else-if="!rows.length" class="empty">
      没有符合条件的房源，<router-link to="/merchant/listings/new">新建一套</router-link>
    </p>

    <table v-else class="table">
      <thead>
        <tr>
          <th>房源</th>
          <th>状态</th>
          <th class="num">租金</th>
          <th class="num">浏览</th>
          <th class="num">收藏</th>
          <th>上架</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td>
            <div class="t">
              <img :src="row.cover" :alt="row.title" loading="lazy" />
              <div>
                <p>{{ row.title }}</p>
                <p class="m">{{ row.region_name }} · {{ row.area }}㎡ · {{ row.orientation_name || '—' }}</p>
              </div>
            </div>
          </td>
          <td><span :class="STATUS_TAG[row.status] ?? 'tag'">{{ LISTING_STATUS[row.status]?.text ?? row.status }}</span></td>
          <td class="num">{{ money(row.rent) }} 元/月</td>
          <td class="num">{{ row.view_count }}</td>
          <td class="num">{{ row.favorite_count }}</td>
          <td>{{ row.published_at ? dateOnly(row.published_at) : '—' }}</td>
          <td>
            <button class="btn ghost sm" type="button" @click="router.push(`/merchant/listings/${row.id}/edit`)">编辑</button>
            <button
              v-if="canToggle(row)"
              class="btn ghost sm"
              type="button"
              style="margin-left: 6px"
              @click="confirmToggle(row)"
            >
              {{ row.status === 'online' ? '下架' : '上架' }}
            </button>
            <button v-else class="btn ghost sm" type="button" style="margin-left: 6px" @click="router.push('/merchant/orders')">
              查看订单
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <p class="hint">房源处于「已出租」时不能改价，也不允许删除；已下架的房源可以重新上架（需要资质已通过审核）。</p>
  </div>
</template>
