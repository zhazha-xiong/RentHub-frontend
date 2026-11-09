<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { aiApi, listingApi, upload } from '@/api'
import { useMetaStore } from '@/stores/meta'
import type { ListingWriteReq, PriceResp } from '@/api/types'
import { money, tomorrow } from '@/utils/format'

/**
 * 商家 · 新建 / 编辑房源 —— 结构沿用 v2 merchant-edit.html：
 *   .head（标题 + 保存按钮）→ .form（左：5 个 .fieldset；右：.drawer「AI 辅助」）
 * 表单控件全部用 v2 的 .field / .grid2 / .with-unit / .facrow / .chkrow，
 * 不再用 antd 表单，这样输入框、下拉、复选框的手感与 v2 完全一致。
 *
 * 注意金额：后端字段是「分」，页面按「元」输入，进出都在这层换算。
 */
const route = useRoute()
const router = useRouter()
const meta = useMetaStore()

const id = computed(() => (route.params.id ? Number(route.params.id) : null))
const isEdit = computed(() => id.value !== null)
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const uploading = ref(false)
const images = ref<string[]>([])
const copyCandidates = ref<{ text: string; valid: boolean }[]>([])
const price = ref<PriceResp | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const form = reactive<ListingWriteReq>({
  title: '',
  description: '',
  region_code: 'shahekou',
  community: '',
  address: '',
  metro_line: undefined,
  walk_minutes: undefined,
  rooms: 2,
  halls: 1,
  baths: 1,
  area: 80,
  floor: 8,
  total_floor: 24,
  orientation: 'south',
  decoration: 'fine',
  house_type: 'apartment',
  rent_type: 'whole',
  has_elevator: true,
  facilities: { bed: [], public: [] },
  rent: 300000,
  deposit: 300000,
  available_date: tomorrow(),
  min_lease_months: 6,
  payment_method: '押一付三',
  viewing_method: '随时看房',
  parking: '',
})

const regionOptions = computed(() => meta.filters?.regions ?? [])
const metroOptions = computed(() => meta.filters?.metro_lines ?? [])
const orientationOptions = computed(() => meta.filters?.orientations ?? [])
const decorationOptions = computed(() => meta.filters?.decorations ?? [])
const houseTypeOptions = computed(() => meta.filters?.house_types ?? [])
const bedOptions = computed(() => meta.filters?.facilities.bed ?? [])
const publicOptions = computed(() => meta.filters?.facilities.public ?? [])

/* ---- v2 里「室 / 厅 / 卫」「楼层 / 总层」都是一个输入框，这里做双向解析 ---- */
const layoutText = computed({
  get: () => `${form.rooms} / ${form.halls ?? 0} / ${form.baths ?? 0}`,
  set: (v: string) => {
    const [r, h, b] = v.split('/').map((s) => Number(s.trim()))
    if (!Number.isNaN(r) && r > 0) form.rooms = Math.min(9, r)
    if (!Number.isNaN(h) && h >= 0) form.halls = Math.min(5, h)
    if (!Number.isNaN(b) && b >= 0) form.baths = Math.min(5, b)
  },
})

const floorText = computed({
  get: () => `${form.floor ?? ''} / ${form.total_floor ?? ''}`,
  set: (v: string) => {
    const [f, t] = v.split('/').map((s) => Number(s.trim()))
    if (!Number.isNaN(f)) form.floor = f
    if (!Number.isNaN(t) && t > 0) form.total_floor = t
  },
})

const rentYuan = computed({
  get: () => Math.round((form.rent ?? 0) / 100),
  set: (v: number | string) => {
    const n = Number(v)
    if (!Number.isNaN(n)) form.rent = Math.round(n * 100)
  },
})
const depositYuan = computed({
  get: () => Math.round((form.deposit ?? 0) / 100),
  set: (v: number | string) => {
    const n = Number(v)
    if (!Number.isNaN(n)) form.deposit = Math.round(n * 100)
  },
})

const bedSel = computed({
  get: () => form.facilities?.bed ?? [],
  set: (v: string[]) => {
    form.facilities = { bed: v, public: form.facilities?.public ?? [] }
  },
})
const publicSel = computed({
  get: () => form.facilities?.public ?? [],
  set: (v: string[]) => {
    form.facilities = { bed: form.facilities?.bed ?? [], public: v }
  },
})

function toggle(list: string[], code: string, set: (v: string[]) => void) {
  set(list.includes(code) ? list.filter((c) => c !== code) : [...list, code])
}
function toggleBed(code: string) {
  toggle(bedSel.value, code, (v) => (bedSel.value = v))
}
function togglePublic(code: string) {
  toggle(publicSel.value, code, (v) => (publicSel.value = v))
}

async function load() {
  if (!id.value) return
  loading.value = true
  try {
    const d = await listingApi.detail(id.value)
    Object.assign(form, {
      title: d.title,
      description: d.description,
      region_code: (meta.filters?.regions ?? []).find((r) => r.name === d.region_name)?.code ?? 'shahekou',
      community: d.community,
      address: d.address,
      metro_line: d.metro?.line,
      walk_minutes: d.metro?.walk_minutes,
      rooms: d.spec.rooms,
      halls: d.spec.halls,
      baths: d.spec.baths,
      area: d.area,
      floor: d.spec.floor ?? undefined,
      total_floor: d.spec.total_floor ?? undefined,
      orientation: (meta.filters?.orientations ?? []).find((o) => o.name === d.spec.orientation)?.code ?? form.orientation,
      decoration: (meta.filters?.decorations ?? []).find((x) => x.name === d.spec.decoration)?.code ?? form.decoration,
      house_type: (meta.filters?.house_types ?? []).find((h) => h.name === d.spec.house_type)?.code ?? form.house_type,
      rent_type: d.spec.rent_type,
      has_elevator: d.tags.includes('有电梯'),
      facilities: d.facilities,
      rent: d.price.rent,
      deposit: d.price.deposit,
      available_date: d.spec.available_date,
      min_lease_months: d.spec.min_lease_months,
      payment_method: d.payment_method ?? '押一付三',
      viewing_method: d.viewing_method ?? '随时看房',
      parking: d.parking ?? '',
    })
    images.value = d.images.map((url) => url.replace('/mock-files/', ''))
    price.value = await aiApi.priceReference({ listing_id: d.id }).catch(() => null)
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

async function pick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const res = await upload(file, 'listing_image')
    images.value.push(res.object_key)
    message.success(`已上传 ${res.file_name ?? '图片'}`)
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function payload(): ListingWriteReq {
  return { ...form, images: images.value }
}

/** 保存（新建后停在编辑页，默认下架） */
async function save() {
  if (!form.title.trim() || !form.address.trim()) {
    message.warning('请填写标题与详细地址')
    return
  }
  saving.value = true
  try {
    if (isEdit.value && id.value !== null) {
      await listingApi.update(id.value, payload())
      message.success('已保存')
      price.value = await aiApi.priceReference({ listing_id: id.value }).catch(() => null)
    } else {
      const res = await listingApi.create(payload())
      message.success('已创建（默认下架，可点「保存并上架」）')
      await router.replace(`/merchant/listings/${res.id}/edit`)
    }
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    saving.value = false
  }
}

/** 保存并上架：资质未通过时后端会返回 403，这里照实提示 */
async function saveAndPublish() {
  if (!form.title.trim() || !form.address.trim()) {
    message.warning('请填写标题与详细地址')
    return
  }
  publishing.value = true
  try {
    let listingId = id.value
    if (listingId !== null) {
      await listingApi.update(listingId, payload())
    } else {
      const res = await listingApi.create(payload())
      listingId = res.id
      await router.replace(`/merchant/listings/${res.id}/edit`)
    }
    await listingApi.setStatus(listingId, 'online')
    message.success('已保存并上架')
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    publishing.value = false
  }
}

async function genCopy(field: 'title' | 'description') {
  if (!id.value) {
    message.info('先保存房源，再让 AI 生成文案')
    return
  }
  try {
    const res = await aiApi.copy({ listing_id: id.value, field })
    copyCandidates.value = res.candidates
  } catch (err) {
    message.error((err as Error).message)
  }
}

function useCandidate(text: string) {
  form.description = text
  copyCandidates.value = []
}

onMounted(async () => {
  await meta.ensure()
  await load()
})
</script>

<template>
  <div>
    <p class="crumbs">
      <router-link to="/merchant/listings">房源管理</router-link><span>/</span>{{ isEdit ? '编辑房源' : '新建房源' }}
    </p>

    <div class="head">
      <div><h1>{{ isEdit ? '编辑房源' : '新建房源' }}</h1></div>
      <div class="right">
        <button class="btn ghost" type="button" @click="router.push('/merchant/listings')">返回列表</button>
        <button class="btn ghost" type="button" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存草稿' }}</button>
        <button class="btn" type="button" :disabled="publishing" @click="saveAndPublish">
          {{ publishing ? '上架中…' : '保存并上架' }}
        </button>
      </div>
    </div>

    <p v-if="loading" class="loading-hint">正在加载房源…</p>

    <div v-else class="form">
      <div>
        <div class="fieldset">
          <h2>基本信息</h2>
          <div class="grid2">
            <div class="field wide">
              <label for="title">标题</label>
              <input id="title" v-model="form.title" type="text" :maxlength="60" placeholder="例如：星海广场 · 2室1厅" />
            </div>
            <div class="field">
              <label for="htype">房屋类型</label>
              <select id="htype" v-model="form.house_type">
                <option v-for="h in houseTypeOptions" :key="h.code" :value="h.code">{{ h.name }}</option>
              </select>
            </div>
            <div class="field">
              <label for="rtype">租赁类型</label>
              <select id="rtype" v-model="form.rent_type">
                <option value="whole">整租</option>
                <option value="shared">合租/单间</option>
              </select>
            </div>
            <div class="field wide">
              <label for="desc">房源描述</label>
              <textarea id="desc" v-model="form.description" rows="3" placeholder="步行距离、采光、家电、周边配套…" />
            </div>
          </div>
        </div>

        <div class="fieldset">
          <h2>位置</h2>
          <div class="grid2">
            <div class="field">
              <label for="region">区域</label>
              <select id="region" v-model="form.region_code">
                <option v-for="r in regionOptions" :key="r.code" :value="r.code">{{ r.name }}</option>
              </select>
            </div>
            <div class="field">
              <label for="comm">小区（选填）</label>
              <input id="comm" v-model="form.community" type="text" />
            </div>
            <div class="field wide">
              <label for="addr">详细地址</label>
              <input id="addr" v-model="form.address" type="text" placeholder="区 · 路 · 门牌号" />
            </div>
            <div class="field">
              <label for="metro">地铁线路</label>
              <select id="metro" v-model="form.metro_line">
                <option :value="undefined">不近地铁</option>
                <option v-for="m in metroOptions" :key="m.code" :value="m.code">{{ m.name }}</option>
              </select>
            </div>
            <div class="field">
              <label for="walk">步行距离</label>
              <div class="with-unit">
                <input id="walk" v-model.number="form.walk_minutes" type="text" inputmode="numeric" />
                <span class="unit">分钟</span>
              </div>
            </div>
          </div>
        </div>

        <div class="fieldset">
          <h2>户型与配套</h2>
          <div class="grid2">
            <div class="field">
              <label for="room">室 / 厅 / 卫</label>
              <input id="room" v-model="layoutText" type="text" placeholder="2 / 1 / 1" />
            </div>
            <div class="field">
              <label for="area">面积</label>
              <div class="with-unit">
                <input id="area" v-model.number="form.area" type="text" inputmode="numeric" />
                <span class="unit">㎡</span>
              </div>
            </div>
            <div class="field">
              <label for="floor">楼层 / 总层</label>
              <input id="floor" v-model="floorText" type="text" placeholder="14 / 26" />
            </div>
            <div class="field">
              <label for="ori">朝向</label>
              <select id="ori" v-model="form.orientation">
                <option v-for="o in orientationOptions" :key="o.code" :value="o.code">{{ o.name }}</option>
              </select>
            </div>
            <div class="field">
              <label for="dec">装修</label>
              <select id="dec" v-model="form.decoration">
                <option v-for="d in decorationOptions" :key="d.code" :value="d.code">{{ d.name }}</option>
              </select>
            </div>
            <div class="field">
              <label>&nbsp;</label>
              <label class="check"><input v-model="form.has_elevator" type="checkbox" /> 有电梯</label>
            </div>
          </div>

          <div class="facrow">
            <span class="faclabel">卧室设施</span>
            <div class="chkrow">
              <label v-for="f in bedOptions" :key="f.code" class="check">
                <input type="checkbox" :checked="bedSel.includes(f.code)" @change="toggleBed(f.code)" /> {{ f.name }}
              </label>
            </div>
          </div>
          <div class="facrow">
            <span class="faclabel">公共设施</span>
            <div class="chkrow">
              <label v-for="f in publicOptions" :key="f.code" class="check">
                <input type="checkbox" :checked="publicSel.includes(f.code)" @change="togglePublic(f.code)" /> {{ f.name }}
              </label>
            </div>
          </div>
        </div>

        <div class="fieldset">
          <h2>租金与租约</h2>
          <div class="grid2">
            <div class="field">
              <label for="rent">月租</label>
              <div class="with-unit">
                <input id="rent" v-model="rentYuan" type="text" inputmode="numeric" />
                <span class="unit">元/月</span>
              </div>
            </div>
            <div class="field">
              <label for="dep">押金</label>
              <div class="with-unit">
                <input id="dep" v-model="depositYuan" type="text" inputmode="numeric" />
                <span class="unit">元</span>
              </div>
            </div>
            <div class="field">
              <label for="avail">可入住日期</label>
              <input id="avail" v-model="form.available_date" type="date" />
            </div>
            <div class="field">
              <label for="min">最短租期</label>
              <select id="min" v-model.number="form.min_lease_months">
                <option :value="3">3 个月</option>
                <option :value="6">6 个月</option>
                <option :value="12">12 个月</option>
              </select>
            </div>
            <div class="field">
              <label for="pay">付款方式</label>
              <select id="pay" v-model="form.payment_method">
                <option>押一付三</option>
                <option>押一付一</option>
                <option>押一付六</option>
                <option>年付</option>
              </select>
            </div>
            <div class="field">
              <label for="view">看房方式</label>
              <select id="view" v-model="form.viewing_method">
                <option>随时可看</option>
                <option>预约看房</option>
                <option>仅周末</option>
              </select>
            </div>
            <div class="field wide">
              <label for="park">车位（选填）</label>
              <input id="park" v-model="form.parking" type="text" placeholder="例如：小区地下车库，另计" />
            </div>
          </div>
        </div>

        <div class="fieldset">
          <h2>图片</h2>
          <p class="hint" style="margin: 0 0 8px">
            已上传 {{ images.length }} 张 · 首图为封面 · 单张不超过 5MB
          </p>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px">
            <div v-for="(key, i) in images" :key="key" style="position: relative">
              <img
                :src="`/mock-files/${key}`"
                alt=""
                style="width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: var(--r-ctl); border: 1px solid var(--border-2)"
              />
              <button
                class="btn ghost sm"
                type="button"
                style="position: absolute; top: 4px; right: 4px; height: 24px; padding: 0 8px"
                @click="images.splice(i, 1)"
              >
                ×
              </button>
            </div>
            <div
              style="aspect-ratio: 4/3; border: 1px dashed var(--border); border-radius: var(--r-ctl); display: grid; place-items: center; color: var(--text-3); font-size: 13px; cursor: pointer"
              @click="fileInput?.click()"
            >
              {{ uploading ? '上传中…' : '上传图片' }}
            </div>
          </div>
          <input ref="fileInput" type="file" accept="image/jpeg,image/png" hidden :disabled="uploading" @change="pick" />
        </div>
      </div>

      <aside class="drawer">
        <div class="dh"><b>AI 辅助</b><span class="close">收起</span></div>
        <div class="dbody">
          <template v-if="price && !price.insufficient && price.range">
            <p style="margin: 0; font-size: 12px; color: var(--text-3)">
              参考价 · {{ price.scope_label ?? '同区域' }} · 样本 {{ price.sample_count }} 套
            </p>
            <p class="range-big">{{ money(price.range.p25 ?? price.range.min) }} – {{ money(price.range.p75 ?? price.range.max) }} 元</p>
            <p class="range-note">
              中位数 {{ money(price.range.median) }} 元 ·
              你的定价 {{ money(form.rent) }} 元
            </p>
            <div style="margin-top: 14px">
              <div v-for="p in price.peers.slice(0, 3)" :key="p.title" class="peer">
                <span>{{ p.title }} · {{ p.area }}㎡ · {{ p.decoration }}</span><b>{{ money(p.rent) }}</b>
              </div>
            </div>
            <p class="why">{{ price.note }}</p>
            <div class="actions">
              <button class="btn" type="button" @click="rentYuan = Math.round(price!.range!.median / 100)">填入中位价</button>
              <button class="btn ghost" type="button" @click="price = null">忽略</button>
            </div>
          </template>
          <template v-else>
            <p class="why" style="border: 0; padding-top: 0; margin-top: 0">
              {{ price?.note ?? '保存房源后，这里会显示同区域同户型的参考价与对比样本。' }}
            </p>
          </template>

          <hr style="border: 0; border-top: 1px solid var(--border-2); margin: 16px 0" />
          <p style="margin: 0 0 8px; font-size: 12px; color: var(--text-3)">文案候选</p>
          <button class="btn ghost sm" type="button" :disabled="!isEdit" @click="genCopy('description')">
            生成描述候选
          </button>
          <div v-for="c in copyCandidates" :key="c.text" class="peer" style="cursor: pointer" @click="useCandidate(c.text)">
            <span>{{ c.text }}</span><b>选用</b>
          </div>
          <p class="why">候选文案只引用已填字段；未填写的「学区」「宠物」不会被写入。</p>
        </div>
      </aside>
    </div>
  </div>
</template>
