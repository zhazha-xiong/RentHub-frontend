<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { favoriteApi, listingApi } from '@/api'
import type { ListingCard, ListingDetail } from '@/api/types'
import { useAuthStore } from '@/stores/auth'
import { bedroomFacilities, publicFacilities } from '@/utils/facilities'
import { LISTING_STATUS, RENT_TYPE, money } from '@/utils/format'
import IconDefs from '@/components/IconDefs.vue'

/**
 * 房源详情 —— 结构与 class 完全沿用旧版 detail.html：
 *   左栏：.media（.stage 大图 + 箭头 + 计数，.thumbs 缩略图）
 *         .panel（房源描述 + kv、位置与交通 + kv、卧室设施 / 公共设施 .facgrid、相关推荐 .related）
 *   右栏：.info（标题 / meta / 价格行 / tags / .spec 户型等信息 / 商家 / 操作 / 问问 AI）
 *
 * 两条与旧版的差异是刻意的：
 *   1. 右栏 .info-sticky 跟随滚动固定（旧版是普通 aside）；
 *   2. 这里不放「AI 参考价」—— 参考价只给商家上架时参考，在商家编辑页的 AI 抽屉里。
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const detail = ref<ListingDetail | null>(null)
const related = ref<ListingCard[]>([])
const loading = ref(true)
const errorText = ref('')
const index = ref(0)
const lightbox = ref(false)
const favorited = ref(false)
const question = ref('')

const images = computed(() => detail.value?.images ?? [])
const currentImage = computed(() => images.value[index.value] ?? '')
const thumbs = computed(() => images.value.slice(0, 5))
const bedFacilities = computed(() => bedroomFacilities(detail.value?.facilities.bed ?? []))
const pubFacilities = computed(() => publicFacilities(detail.value?.facilities.public ?? []))

const tags = computed(() => {
  const d = detail.value
  if (!d) return []
  const list: { text: string; cls?: string }[] = []
  if (d.metro) list.push({ text: '近地铁' })
  if (d.tags.some((t) => t.includes('电梯'))) list.push({ text: '有电梯' })
  if (d.spec.decoration) list.push({ text: d.spec.decoration })
  list.push({ text: LISTING_STATUS[d.status]?.text ?? d.status, cls: 'plain' })
  if (d.viewing_method) list.push({ text: d.viewing_method, cls: 'hue' })
  return list
})

function prev() {
  if (!images.value.length) return
  index.value = (index.value - 1 + images.value.length) % images.value.length
}
function next() {
  if (!images.value.length) return
  index.value = (index.value + 1) % images.value.length
}

async function load() {
  loading.value = true
  try {
    const data = await listingApi.detail(String(route.params.id))
    detail.value = data
    favorited.value = Boolean(data.favorited)
    /* 相关推荐由后端给（同区域优先 + 随机 3 套），前端不再自己拼列表 */
    related.value = data.related ?? []
  } catch (err) {
    errorText.value = (err as Error).message
  } finally {
    loading.value = false
  }
}

async function toggleFavorite() {
  if (!detail.value) return
  if (!auth.isLoggedIn) {
    await router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  try {
    const res = await favoriteApi.toggle(detail.value.id, !favorited.value)
    favorited.value = res.favorited
    auth.setCounts({ favorites: Math.max(0, auth.counts.favorites + (res.favorited ? 1 : -1)) })
    message.success(res.favorited ? '已加入收藏' : '已取消收藏')
  } catch (err) {
    message.error((err as Error).message)
  }
}

function ask(text?: string) {
  void router.push({ path: '/ai', query: { listing_id: String(route.params.id), q: text ?? '' } })
}

function askFromInput() {
  ask(question.value.trim() || undefined)
}

onMounted(load)
</script>

<template>
  <div>
    <IconDefs />

    <!-- RTM 34：区域 / 小区 / 房源 三级，前两级可点击回列表 -->
    <p v-if="detail" class="crumbs">
      <router-link to="/">{{ detail.region_name }}</router-link>
      <template v-if="detail.community">
        <span>/</span><router-link to="/">{{ detail.community }}</router-link>
      </template>
      <span>/</span>{{ detail.title }}
    </p>

    <p v-if="loading" class="loading-hint">正在加载房源…</p>
    <p v-else-if="!detail" class="empty">
      {{ errorText || '房源不存在或已下架' }}，<router-link to="/">回到找房</router-link>
    </p>

    <div v-else class="detail">
      <!-- 左栏 -->
      <div>
        <div class="media">
          <div class="stage">
            <img :src="currentImage" :alt="`${detail.title} 实拍图`" @click="lightbox = true" />
            <button v-if="images.length > 1" class="nav prev" type="button" aria-label="上一张" @click="prev">‹</button>
            <button v-if="images.length > 1" class="nav next" type="button" aria-label="下一张" @click="next">›</button>
            <span class="counter">{{ index + 1 }} / {{ images.length }}</span>
          </div>
          <div v-if="images.length" class="thumbs">
            <button
              v-for="(img, i) in thumbs"
              :key="img + i"
              class="th"
              :class="{ on: i === index }"
              type="button"
              :aria-label="`第 ${i + 1} 张`"
              @click="index = i"
            >
              <img :src="img" alt="" />
            </button>
            <button v-if="images.length > 5" class="th more" type="button" :aria-label="`查看全部 ${images.length} 张`" @click="lightbox = true">
              +{{ images.length - 4 }}
            </button>
          </div>
        </div>

        <section class="panel">
          <h2>房源描述</h2>
          <p class="prose">{{ detail.description }}</p>
          <!-- RTM 37：租约四项常显，商家没填时写「未填写」（是事实陈述，不是编造默认值） -->
          <div class="kv">
            <span><b>付款方式</b> {{ detail.payment_method || '未填写' }}</span>
            <span><b>最短租期</b> {{ detail.spec.min_lease_months ? `${detail.spec.min_lease_months} 个月` : '未填写' }}</span>
            <span><b>看房</b> {{ detail.viewing_method || '未填写' }}</span>
            <span><b>车位</b> {{ detail.parking || '未填写' }}</span>
          </div>
        </section>

        <section class="panel">
          <h2>位置与交通</h2>
          <p class="prose">{{ detail.address }}</p>
          <div class="kv">
            <span v-if="detail.community"><b>小区</b> {{ detail.community }}</span>
            <span v-if="detail.metro"><b>地铁</b> {{ detail.metro.line }} 号线</span>
            <span v-if="detail.metro?.walk_meters != null"><b>步行</b> {{ detail.metro.walk_meters }} 米</span>
            <span v-else-if="detail.metro?.walk_minutes"><b>步行</b> {{ detail.metro.walk_minutes }} 分钟</span>
          </div>
        </section>

        <section class="panel">
          <h2>卧室设施</h2>
          <div v-if="bedFacilities.length" class="facgrid">
            <div v-for="f in bedFacilities" :key="f.label" class="fac">
              <svg class="ic" aria-hidden="true"><use :href="`#${f.icon}`" /></svg><span>{{ f.label }}</span>
            </div>
          </div>
          <p v-else class="hint">商家暂未填写卧室设施</p>

          <h2 style="margin-top: 24px">公共设施</h2>
          <div v-if="pubFacilities.length" class="facgrid">
            <div v-for="f in pubFacilities" :key="f.label" class="fac">
              <svg class="ic" aria-hidden="true"><use :href="`#${f.icon}`" /></svg><span>{{ f.label }}</span>
            </div>
          </div>
          <p v-else class="hint">商家暂未填写公共设施</p>
        </section>

        <section class="panel">
          <h2>相关推荐</h2>
          <p class="hint" style="margin: 0 0 12px">同区域、同户型、价格接近的 {{ related.length }} 套</p>
          <div v-if="related.length" class="related">
            <router-link v-for="r in related" :key="r.id" class="rel" :to="`/listings/${r.id}`">
              <img :src="r.cover" :alt="r.title" loading="lazy" />
              <p class="t">{{ r.title }}</p>
              <p class="m">{{ r.area }}㎡ · {{ r.floor_desc }}</p>
              <p class="p"><b>{{ money(r.rent) }}</b> 元/月</p>
            </router-link>
          </div>
          <p v-else class="hint">暂无相似房源</p>
        </section>
      </div>

      <!-- 右栏：旧版 .info + 新版 sticky -->
      <aside class="info info-sticky">
        <h1 class="title">{{ detail.title }}</h1>
        <p class="meta">
          {{ detail.region_name }} · {{ detail.area }}㎡ · {{ detail.spec.orientation }} · {{ detail.floor_desc }} ·
          {{ detail.spec.decoration }}
        </p>

        <div class="price-row">
          <b>{{ money(detail.rent) }}</b>
          <span>元/月 · 押金 {{ money(detail.price.deposit) }} · 服务费 {{ money(detail.price.service_fee) }}</span>
        </div>

        <div class="tags">
          <span v-for="t in tags" :key="t.text" class="tag" :class="t.cls">{{ t.text }}</span>
        </div>

        <dl class="spec">
          <div><dt>户型</dt><dd>{{ detail.spec.rooms }} 室 {{ detail.spec.halls }} 厅 {{ detail.spec.baths }} 卫</dd></div>
          <div><dt>面积</dt><dd>{{ detail.area }} ㎡</dd></div>
          <div><dt>楼层</dt><dd>{{ detail.spec.floor ?? '—' }} / {{ detail.spec.total_floor ?? '—' }} 层</dd></div>
          <div><dt>朝向</dt><dd>{{ detail.spec.orientation || '—' }}</dd></div>
          <div><dt>装修</dt><dd>{{ detail.spec.decoration || '—' }}</dd></div>
          <div><dt>类型</dt><dd>{{ detail.spec.house_type || '—' }}</dd></div>
          <div><dt>租赁</dt><dd>{{ RENT_TYPE[detail.spec.rent_type] ?? detail.spec.rent_type }}</dd></div>
          <div><dt>可入住</dt><dd>{{ detail.spec.available_date }}</dd></div>
        </dl>

        <div class="merchant">
          <span class="ava">{{ detail.merchant.name.slice(0, 1) }}</span>
          <div>
            <b>{{ detail.merchant.name }}</b>
            <p>
              {{ detail.merchant.listing_count }} 套在架 ·
              {{ detail.merchant.verified ? '资质已认证' : '资质未认证' }} · 平均响应 1 小时
            </p>
          </div>
        </div>

        <div class="actions">
          <button class="btn ghost" type="button" @click="toggleFavorite">{{ favorited ? '已收藏' : '收藏' }}</button>
          <router-link
            class="btn"
            :to="detail.status === 'online' ? `/booking/${detail.id}` : `/listings/${detail.id}`"
            style="display: flex; align-items: center; justify-content: center; text-decoration: none"
            :style="detail.status !== 'online' ? { opacity: 0.55, pointerEvents: 'none' } : undefined"
          >
            {{ detail.status === 'online' ? '立即租下' : '当前不可租' }}
          </router-link>
        </div>

        <div class="askai">
          <div class="ah"><span class="dot-ai" aria-hidden="true"></span><b>问问 AI</b></div>
          <p class="q1">「这套采光和通勤怎么样？」</p>
          <div class="qh">
            <button type="button" @click="ask('离地铁多远')">离地铁多远</button>
            <button type="button" @click="ask('和附近同价位比')">和附近同价位比</button>
          </div>
          <form class="qform" @submit.prevent="askFromInput">
            <input v-model="question" type="text" placeholder="就这套继续问" aria-label="就这套继续问" />
            <button class="btn sm" type="submit">发送</button>
          </form>
        </div>
      </aside>
    </div>

    <!-- 旧版没有 lightbox，这里补一个最简大图查看（点大图/缩略图「+N」打开） -->
    <div v-if="lightbox" class="lightbox" @click.self="lightbox = false">
      <button class="lb-close" type="button" aria-label="关闭" @click="lightbox = false">×</button>
      <button class="lb-nav prev" type="button" aria-label="上一张" @click="prev">‹</button>
      <img :src="currentImage" :alt="detail?.title ?? ''" />
      <button class="lb-nav next" type="button" aria-label="下一张" @click="next">›</button>
      <span class="lb-counter">{{ index + 1 }} / {{ images.length }}</span>
    </div>
  </div>
</template>
