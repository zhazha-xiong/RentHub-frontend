<script setup lang="ts">
import type { ListingCard } from '@/api/types'
import { money } from '@/utils/format'

defineProps<{ listing: ListingCard; active?: boolean }>()
</script>

<template>
  <router-link :to="`/listings/${listing.id}`" style="display: block; color: inherit">
    <a-card
      hoverable
      :body-style="{ padding: '12px 14px 14px' }"
      :style="{ borderColor: active ? 'var(--rh-primary)' : undefined, overflow: 'hidden' }"
    >
      <template #cover>
        <div style="aspect-ratio: 4 / 3; background: var(--rh-bg); overflow: hidden">
          <img
            :src="listing.cover"
            :alt="listing.title"
            loading="lazy"
            style="width: 100%; height: 100%; object-fit: cover; display: block"
          />
        </div>
      </template>

      <div style="font-size: 15px; font-weight: 600; line-height: 1.4; margin-bottom: 6px">
        {{ listing.title }}
      </div>
      <div class="rh-muted" style="margin-bottom: 8px">
        {{ listing.region_name }}<template v-if="listing.community"> · {{ listing.community }}</template> ·
        {{ listing.layout }} · {{ listing.area }}㎡
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; min-height: 22px">
        <a-tag v-for="tag in listing.tags.slice(0, 3)" :key="tag" :bordered="false" style="margin: 0; font-size: 12px">
          {{ tag }}
        </a-tag>
      </div>
      <div style="display: flex; align-items: baseline; justify-content: space-between">
        <span class="rh-price" style="font-size: 18px">
          {{ money(listing.rent) }}<span style="font-size: 12px; font-weight: 400; color: var(--rh-text-2)"> 元/月</span>
        </span>
        <span class="rh-muted">{{ listing.floor_desc }}</span>
      </div>
    </a-card>
  </router-link>
</template>
