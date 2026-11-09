<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { listingApi, merchantApi } from '@/api'
import { LISTING_STATUS, money } from '@/utils/format'

type Row = {
  id: number
  title: string
  cover: string
  layout: string
  area: number
  rent: number
  status: string
  view_count: number
  favorite_count: number
}

const router = useRouter()
const rows = ref<Row[]>([])
const counts = ref<Record<string, number>>({})
const loading = ref(true)
const tab = ref('all')

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'online', label: '在架' },
  { key: 'offline', label: '已下架' },
  { key: 'locked', label: '已锁定' },
  { key: 'rented', label: '已出租' },
]

const columns = [
  { title: '房源', dataIndex: 'title', key: 'title' },
  { title: '状态', dataIndex: 'status', key: 'status', width: 110 },
  { title: '租金', dataIndex: 'rent', key: 'rent', width: 130 },
  { title: '浏览 / 收藏', key: 'stat', width: 130 },
  { title: '操作', key: 'action', width: 180 },
]

async function load() {
  loading.value = true
  try {
    const data = await merchantApi.listings({ status: tab.value })
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

onMounted(load)
</script>

<template>
  <div>
    <div class="rh-section-title">
      <h1 style="font-size: 22px; margin: 0">房源管理</h1>
      <a-space>
        <span class="rh-muted">共 {{ counts.all ?? 0 }} 套 · 在架 {{ counts.online ?? 0 }}</span>
        <a-button type="primary" @click="router.push('/merchant/listings/new')">新建房源</a-button>
      </a-space>
    </div>

    <a-tabs v-model:active-key="tab" @change="load">
      <a-tab-pane v-for="t in TABS" :key="t.key" :tab="`${t.label} ${counts[t.key] ?? 0}`" />
    </a-tabs>

    <a-table :columns="columns" :data-source="rows" :loading="loading" row-key="id" :pagination="false">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'title'">
          <div style="display: flex; gap: 10px; align-items: center">
            <img :src="record.cover" alt="" style="width: 72px; height: 54px; object-fit: cover; border-radius: 4px" />
            <div>
              <div style="font-weight: 600">{{ record.title }}</div>
              <div class="rh-muted">{{ record.layout }} · {{ record.area }}㎡</div>
            </div>
          </div>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="LISTING_STATUS[record.status]?.color">{{ LISTING_STATUS[record.status]?.text ?? record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'rent'">
          <span class="rh-price">{{ money(record.rent) }}</span> 元/月
        </template>
        <template v-else-if="column.key === 'stat'">
          {{ record.view_count }} / {{ record.favorite_count }}
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space>
            <a-button size="small" @click="router.push(`/merchant/listings/${record.id}/edit`)">编辑</a-button>
            <a-button
              size="small"
              :disabled="record.status === 'locked' || record.status === 'rented'"
              @click="confirmToggle(record as Row)"
            >
              {{ record.status === 'online' ? '下架' : '上架' }}
            </a-button>
          </a-space>
        </template>
      </template>
    </a-table>
  </div>
</template>
