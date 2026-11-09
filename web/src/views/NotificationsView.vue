<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { noticeApi } from '@/api'
import type { Notice } from '@/api/types'
import { dateTime } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

/**
 * 通知中心 —— 结构沿用 v2 messages.html：
 *   .head（h1 + .unread-chip + 右侧按钮）→ nav.tabs（全部/订单/房源/系统）→ article.note
 */
const router = useRouter()
const auth = useAuthStore()

const items = ref<Notice[]>([])
const unread = ref(0)
const loading = ref(true)
const onlyUnread = ref(false)
const typeTab = ref<'all' | 'order' | 'listing' | 'system'>('all')

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'order', label: '订单' },
  { key: 'listing', label: '房源' },
  { key: 'system', label: '系统' },
] as const

const shown = computed(() => {
  let list = items.value
  if (typeTab.value !== 'all') list = list.filter((n) => n.type === typeTab.value)
  if (onlyUnread.value) list = list.filter((n) => !n.is_read)
  return list
})

async function load() {
  loading.value = true
  try {
    const data = await noticeApi.list({})
    items.value = data.items
    unread.value = data.unread
    auth.setCounts({ messages: data.unread })
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

async function readOne(n: Notice) {
  if (!n.is_read) {
    try {
      await noticeApi.read(n.id)
      n.is_read = true
      unread.value = Math.max(0, unread.value - 1)
      auth.setCounts({ messages: unread.value })
    } catch (err) {
      message.error((err as Error).message)
    }
  }
  if (n.target_type === 'order' && n.target_id) void router.push(`/orders/${n.target_id}`)
  if (n.target_type === 'listing' && n.target_id) void router.push(`/listings/${n.target_id}`)
}

async function readAll() {
  try {
    await noticeApi.readAll()
    items.value.forEach((n) => (n.is_read = true))
    unread.value = 0
    auth.setCounts({ messages: 0 })
    message.success('已全部标为已读')
  } catch (err) {
    message.error((err as Error).message)
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="head">
      <h1>
        通知中心
        <span v-if="unread" class="unread-chip">{{ unread }} 条未读</span>
      </h1>
      <div class="right">
        <button class="btn ghost sm" type="button" :class="{ 'is-on': onlyUnread }" @click="onlyUnread = !onlyUnread">
          {{ onlyUnread ? '显示全部' : '只看未读' }}
        </button>
        <button class="btn ghost sm" type="button" :disabled="!unread" @click="readAll">全部标为已读</button>
      </div>
    </div>

    <nav class="tabs" aria-label="通知类型">
      <a v-for="t in TABS" :key="t.key" href="#" :class="{ on: typeTab === t.key }" @click.prevent="typeTab = t.key">
        {{ t.label }}
      </a>
    </nav>

    <p v-if="loading && !items.length" class="loading-hint">正在加载…</p>
    <p v-else-if="!shown.length" class="empty">暂无通知</p>

    <article
      v-for="n in shown"
      :key="n.id"
      class="note"
      :class="{ unread: !n.is_read }"
      style="cursor: pointer"
      @click="readOne(n)"
    >
      <span class="dot" aria-hidden="true" />
      <div class="nb">
        <p class="nt">{{ n.title }}</p>
        <p class="nx">{{ n.body }}</p>
      </div>
      <time class="tm">{{ dateTime(n.created_at) }}</time>
    </article>
  </div>
</template>
