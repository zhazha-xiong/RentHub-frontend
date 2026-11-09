<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { favoriteApi } from '@/api'
import type { ListingCard } from '@/api/types'
import ListingCardView from '@/components/ListingCard.vue'

const items = ref<ListingCard[]>([])
const loading = ref(true)
const cursor = ref<string | null>(null)

async function load(next?: string) {
  loading.value = true
  try {
    const data = await favoriteApi.list(next ? { cursor: next } : {})
    items.value = next ? [...items.value, ...data.items] : data.items
    cursor.value = data.next_cursor
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <div>
    <div class="rh-section-title">
      <h1 style="font-size: 22px; margin: 0">我的收藏</h1>
      <span class="rh-muted">共 {{ items.length }} 套</span>
    </div>

    <a-spin :spinning="loading">
      <div v-if="items.length" class="rh-grid">
        <ListingCardView v-for="item in items" :key="item.id" :listing="item" />
      </div>
      <a-empty v-else-if="!loading" class="rh-empty" description="还没有收藏的房源">
        <router-link to="/"><a-button type="primary">去找房</a-button></router-link>
      </a-empty>
      <div v-if="cursor" style="text-align: center; margin-top: 20px">
        <a-button :loading="loading" @click="load(cursor ?? undefined)">加载更多</a-button>
      </div>
    </a-spin>
  </div>
</template>
