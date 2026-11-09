<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { favoriteApi } from '@/api'
import type { ListingCard } from '@/api/types'
import ListingCardView from '@/components/ListingCard.vue'

/**
 * 我的收藏 —— 结构沿用 v2 favorites.html：
 *   h1 → .sortbar（排序 + 共 N 套）→ .masonry（.card 瀑布流）
 * 收藏页里的「收藏」按钮按下去就是取消收藏，所以文案固定为「已收藏」。
 */
const items = ref<ListingCard[]>([])
const loading = ref(true)
const cursor = ref<string | null>(null)
const sort = ref<'recent' | 'price_asc'>('recent')

const sorted = computed(() =>
  sort.value === 'price_asc' ? [...items.value].sort((a, b) => a.rent - b.rent || a.id - b.id) : items.value,
)

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

async function unfavorite(item: ListingCard) {
  try {
    await favoriteApi.toggle(item.id, false)
    items.value = items.value.filter((i) => i.id !== item.id)
    message.success('已取消收藏')
  } catch (err) {
    message.error((err as Error).message)
  }
}

onMounted(() => void load())
</script>

<template>
  <div>
    <h1>我的收藏</h1>

    <div class="sortbar">
      <div class="sorts">
        <button class="sort" :class="{ 'is-on': sort === 'recent' }" :aria-pressed="sort === 'recent'" @click="sort = 'recent'">
          最近收藏
        </button>
        <button class="sort" :class="{ 'is-on': sort === 'price_asc' }" :aria-pressed="sort === 'price_asc'" @click="sort = 'price_asc'">
          价格从低到高
        </button>
      </div>
      <p class="note">共 {{ items.length }} 套</p>
    </div>

    <p v-if="loading && !items.length" class="loading-hint">正在加载…</p>

    <section v-else-if="sorted.length" class="masonry" aria-label="收藏的房源">
      <ListingCardView
        v-for="item in sorted"
        :key="item.id"
        :listing="item"
        :favorited="true"
        @toggle-favorite="unfavorite"
      />
    </section>

    <p v-else class="empty">
      还没有收藏的房源，<router-link to="/">去找房</router-link>
    </p>

    <div v-if="cursor" style="text-align: center; margin-top: 20px">
      <button class="btn ghost" type="button" :disabled="loading" @click="load(cursor ?? undefined)">
        {{ loading ? '加载中…' : '加载更多' }}
      </button>
    </div>
  </div>
</template>
