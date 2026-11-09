<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { noticeApi } from '@/api'
import type { Notice } from '@/api/types'
import { dateTime } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const items = ref<Notice[]>([])
const unread = ref(0)
const loading = ref(true)
const onlyUnread = ref(false)

const TYPE_LABEL: Record<string, { text: string; color: string }> = {
  order: { text: '订单', color: 'blue' },
  listing: { text: '房源', color: 'green' },
  system: { text: '系统', color: 'default' },
}

async function load() {
  loading.value = true
  try {
    const data = await noticeApi.list(onlyUnread.value ? { is_read: false } : {})
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
    <div class="rh-section-title">
      <h1 style="font-size: 22px; margin: 0">通知中心 <span class="rh-muted">{{ unread }} 条未读</span></h1>
      <a-space>
        <a-checkbox v-model:checked="onlyUnread" @change="load">只看未读</a-checkbox>
        <a-button :disabled="!unread" @click="readAll">全部标为已读</a-button>
      </a-space>
    </div>

    <a-spin :spinning="loading">
      <a-empty v-if="!items.length && !loading" class="rh-empty" description="暂无通知" />
      <a-list v-else :data-source="items" item-layout="vertical">
        <template #renderItem="{ item }">
          <a-list-item style="cursor: pointer" @click="readOne(item)">
            <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap">
              <a-badge :status="item.is_read ? 'default' : 'processing'" />
              <a-tag :color="TYPE_LABEL[item.type]?.color">{{ TYPE_LABEL[item.type]?.text ?? item.type }}</a-tag>
              <strong style="font-size: 15px">{{ item.title }}</strong>
              <span class="rh-muted" style="margin-left: auto">{{ dateTime(item.created_at) }}</span>
            </div>
            <div style="margin-top: 6px; color: var(--rh-text-2)">{{ item.body }}</div>
          </a-list-item>
        </template>
      </a-list>
    </a-spin>
  </div>
</template>
