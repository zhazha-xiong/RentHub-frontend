<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { aiApi, favoriteApi, listingApi } from '@/api'
import type { ListingDetail, PriceResp } from '@/api/types'
import { LISTING_STATUS, RENT_TYPE, money } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const detail = ref<ListingDetail | null>(null)
const price = ref<PriceResp | null>(null)
const loading = ref(true)
const favoriting = ref(false)

const id = computed(() => Number(route.params.id))

async function load() {
  loading.value = true
  try {
    detail.value = await listingApi.detail(id.value)
    price.value = await aiApi.priceReference({ listing_id: id.value }).catch(() => null)
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

async function toggleFavorite() {
  if (!auth.isLoggedIn) {
    void router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  if (!detail.value) return
  favoriting.value = true
  try {
    const res = await favoriteApi.toggle(detail.value.id, !detail.value.favorited)
    detail.value.favorited = res.favorited
    detail.value.favorite_count = res.count
    auth.setCounts({ favorites: Math.max(0, auth.counts.favorites + (res.favorited ? 1 : -1)) })
    message.success(res.favorited ? '已收藏' : '已取消收藏')
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    favoriting.value = false
  }
}

function book() {
  if (!detail.value) return
  if (!auth.isLoggedIn) {
    void router.push({ path: '/login', query: { redirect: `/booking/${detail.value.id}` } })
    return
  }
  if (auth.role !== 'tenant') {
    message.warning('只有租客账号可以下单')
    return
  }
  void router.push(`/booking/${detail.value.id}`)
}

function askAi() {
  void router.push({ path: '/ai', query: { listing_id: String(id.value) } })
}

onMounted(load)
</script>

<template>
  <a-spin :spinning="loading">
    <a-result v-if="!detail && !loading" status="404" title="房源不存在或已下架">
      <template #extra><a-button type="primary" @click="router.push('/')">回到找房</a-button></template>
    </a-result>

    <div v-else-if="detail">
      <a-breadcrumb style="margin-bottom: 12px">
        <a-breadcrumb-item><router-link to="/">找房</router-link></a-breadcrumb-item>
        <a-breadcrumb-item>{{ detail.region_name }}</a-breadcrumb-item>
        <a-breadcrumb-item>{{ detail.title }}</a-breadcrumb-item>
      </a-breadcrumb>

      <a-row :gutter="20">
        <a-col :xs="24" :lg="15">
          <a-card :body-style="{ padding: 12 }">
            <a-image-preview-group>
              <a-row :gutter="8">
                <a-col v-for="(img, i) in detail.images" :key="img" :span="i === 0 ? 24 : 8">
                  <a-image :src="img" :height="i === 0 ? 360 : 118" style="object-fit: cover; width: 100%; border-radius: 6px" />
                </a-col>
              </a-row>
            </a-image-preview-group>
            <a-empty v-if="!detail.images.length" description="暂无图片" />
          </a-card>

          <a-card style="margin-top: 16px" title="房源描述">
            <p style="line-height: 1.8; margin: 0">{{ detail.description }}</p>
            <a-divider />
            <a-descriptions :column="2" size="small">
              <a-descriptions-item label="规格">
                {{ detail.layout }} · {{ detail.area }}㎡ · {{ detail.spec.orientation }}
              </a-descriptions-item>
              <a-descriptions-item label="楼层">{{ detail.floor_desc }}</a-descriptions-item>
              <a-descriptions-item label="装修">{{ detail.spec.decoration }}</a-descriptions-item>
              <a-descriptions-item label="类型">
                {{ detail.spec.house_type }} · {{ RENT_TYPE[detail.spec.rent_type] }}
              </a-descriptions-item>
              <a-descriptions-item label="可入住">{{ detail.spec.available_date }}</a-descriptions-item>
              <a-descriptions-item label="最短租期">{{ detail.spec.min_lease_months }} 个月</a-descriptions-item>
              <a-descriptions-item label="位置" :span="2">
                {{ detail.region_name }} · {{ detail.address }}
                <template v-if="detail.metro">
                  （地铁 {{ detail.metro.line }} 号线步行 {{ detail.metro.walk_minutes }} 分钟）
                </template>
              </a-descriptions-item>
            </a-descriptions>

            <a-divider>设施</a-divider>
            <a-space wrap>
              <a-tag v-for="f in detail.facilities.bed" :key="`bed-${f}`" color="blue">{{ f }}</a-tag>
              <a-tag v-for="f in detail.facilities.public" :key="`pub-${f}`" color="green">{{ f }}</a-tag>
            </a-space>
          </a-card>

          <a-card v-if="price" style="margin-top: 16px" title="AI 参考价">
            <template #extra>
              <a-tag :color="price.insufficient ? 'default' : price.relaxed ? 'orange' : 'blue'">
                {{ price.insufficient ? '样本不足' : price.relaxed ? `已放宽：${price.scope_label ?? '更大范围'}` : price.scope_label ?? '同区域样本' }}
              </a-tag>
            </template>

            <a-alert v-if="price.insufficient || !price.range" type="info" show-icon :message="price.note" />

            <template v-else>
              <a-row :gutter="12">
                <a-col :span="8">
                  <a-statistic title="中位价" :value="money(price.range.median)" suffix="元/月" />
                </a-col>
                <a-col :span="8">
                  <a-statistic title="低区间（P25）" :value="money(price.range.p25 ?? price.range.min)" suffix="元/月" />
                </a-col>
                <a-col :span="8">
                  <a-statistic title="高区间（P75）" :value="money(price.range.p75 ?? price.range.max)" suffix="元/月" />
                </a-col>
              </a-row>
              <div class="rh-muted" style="margin-top: 10px">
                {{ price.note }} 样本 {{ price.sample_count }} 条（最少 {{ price.min_sample ?? 3 }} 条）。
              </div>
              <template v-if="price.peers.length">
                <a-divider style="margin: 12px 0" />
                <div class="rh-muted">对标房源</div>
                <a-list size="small" :data-source="price.peers">
                  <template #renderItem="{ item }">
                    <a-list-item>
                      <span>{{ item.title }}</span>
                      <span class="rh-muted">{{ item.area }}㎡ · {{ item.decoration }}</span>
                      <span class="rh-price">{{ money(item.rent) }} 元/月</span>
                    </a-list-item>
                  </template>
                </a-list>
              </template>
            </template>
          </a-card>
        </a-col>

        <a-col :xs="24" :lg="9">
          <a-card style="position: sticky; top: 84px">
            <div style="display: flex; align-items: baseline; gap: 8px">
              <span class="rh-price" style="font-size: 30px">{{ money(detail.rent) }}</span>
              <span class="rh-muted">元/月</span>
              <a-tag :color="LISTING_STATUS[detail.status]?.color" style="margin-left: auto">
                {{ LISTING_STATUS[detail.status]?.text ?? detail.status }}
              </a-tag>
            </div>
            <div class="rh-muted" style="margin-top: 8px">
              押金 {{ money(detail.price.deposit) }} 元 · 服务费约 {{ money(detail.price.service_fee) }} 元
            </div>

            <a-divider style="margin: 14px 0" />

            <div style="display: flex; align-items: center; gap: 10px">
              <a-avatar style="background: var(--rh-primary)">{{ detail.merchant.name.slice(0, 1) }}</a-avatar>
              <div>
                <div style="font-weight: 600">{{ detail.merchant.name }}</div>
                <div class="rh-muted">
                  在架 {{ detail.merchant.listing_count }} 套
                  <a-tag v-if="detail.merchant.verified" color="green" style="margin-left: 6px">资质已认证</a-tag>
                  <a-tag v-else color="orange" style="margin-left: 6px">资质未认证</a-tag>
                </div>
              </div>
            </div>

            <a-space direction="vertical" style="width: 100%; margin-top: 16px">
              <a-button type="primary" size="large" block :disabled="detail.status !== 'online'" @click="book">
                {{ detail.status === 'online' ? '立即下单' : '当前不可租' }}
              </a-button>
              <a-space style="width: 100%">
                <a-button :loading="favoriting" @click="toggleFavorite">
                  {{ detail.favorited ? '已收藏' : '收藏' }}
                  <template v-if="detail.favorite_count">（{{ detail.favorite_count }}）</template>
                </a-button>
                <a-button @click="askAi">问问 AI</a-button>
              </a-space>
            </a-space>

            <a-divider style="margin: 16px 0" />
            <div class="rh-muted">
              浏览 {{ detail.view_count ?? 0 }} 次 · 状态「{{ LISTING_STATUS[detail.status]?.text }}」
            </div>
          </a-card>
        </a-col>
      </a-row>
    </div>
  </a-spin>
</template>
