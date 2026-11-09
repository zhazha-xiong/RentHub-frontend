<script setup lang="ts">
import { computed } from 'vue'
import type { ListingCard } from '@/api/types'
import { money } from '@/utils/format'

/**
 * 房源卡片 —— 结构与 class 完全沿用 v2 的 .card（首页、收藏页共用）
 *
 * 封面比例用后端给的 cover_w / cover_h（v2 是手工写 --ar，现在由假后端按真实照片给出），
 * 所以瀑布流每一列都是图片的原始比例，不会因为写死比例而出现裁切或布局跳动。
 */
const props = withDefaults(
  defineProps<{
    listing: ListingCard
    favorited?: boolean
    /** 传 false 可隐藏收藏按钮（如只读列表） */
    showFav?: boolean
  }>(),
  { favorited: false, showFav: true },
)

const emit = defineEmits<{ (e: 'toggle-favorite', item: ListingCard): void }>()

const aspect = computed(() => `${props.listing.cover_w ?? 4} / ${props.listing.cover_h ?? 3}`)

/** 第二行顺序与 v2 一致：区域 · 面积 · 朝向 · 楼层 · 装修 */
const meta = computed(() =>
  [
    props.listing.region_name,
    `${props.listing.area}㎡`,
    props.listing.orientation_name,
    props.listing.floor_desc,
    props.listing.decoration_name,
  ]
    .filter(Boolean)
    .join(' · '),
)
</script>

<template>
  <router-link class="card" :to="`/listings/${listing.id}`">
    <div class="thumb" :style="{ '--ar': aspect }">
      <img :src="listing.cover" :alt="`${listing.title} 实拍图`" loading="lazy" />
      <button
        v-if="showFav"
        class="fav"
        type="button"
        :aria-label="favorited ? `取消收藏 ${listing.title}` : `收藏 ${listing.title}`"
        :class="{ 'is-on': favorited }"
        @click.prevent.stop="emit('toggle-favorite', listing)"
      >
        {{ favorited ? '已收藏' : '收藏' }}
      </button>
    </div>
    <div class="card-body">
      <h3 class="card-title">{{ listing.title }}</h3>
      <p class="card-meta">{{ meta }}</p>
      <p v-if="listing.tags.length" class="card-tags">
        <span v-for="tag in listing.tags" :key="tag" class="tag">{{ tag }}</span>
      </p>
      <p class="card-foot">
        <span class="when">{{ listing.published_label ?? '待上架' }}</span>
        <span class="price"><b>{{ money(listing.rent) }}</b> 元/月</span>
      </p>
    </div>
  </router-link>
</template>
