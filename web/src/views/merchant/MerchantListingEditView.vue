<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { aiApi, listingApi, upload } from '@/api'
import { useMetaStore } from '@/stores/meta'
import type { ListingWriteReq } from '@/api/types'
import { tomorrow } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const meta = useMetaStore()

const id = computed(() => (route.params.id ? Number(route.params.id) : null))
const isEdit = computed(() => id.value !== null)
const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const images = ref<string[]>([])
const copyCandidates = ref<{ text: string; valid: boolean }[]>([])

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

const regionOptions = computed(() => (meta.filters?.regions ?? []).map((r) => ({ value: r.code, label: r.name })))
const metroOptions = computed(() => (meta.filters?.metro_lines ?? []).map((m) => ({ value: m.code, label: m.name })))
const orientationOptions = computed(() => (meta.filters?.orientations ?? []).map((o) => ({ value: o.code, label: o.name })))
const decorationOptions = computed(() => (meta.filters?.decorations ?? []).map((d) => ({ value: d.code, label: d.name })))
const houseTypeOptions = computed(() => (meta.filters?.house_types ?? []).map((h) => ({ value: h.code, label: h.name })))
const bedOptions = computed(() => (meta.filters?.facilities.bed ?? []).map((f) => ({ value: f.code, label: f.name })))
const publicOptions = computed(() => (meta.filters?.facilities.public ?? []).map((f) => ({ value: f.code, label: f.name })))

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
      rent_type: d.spec.rent_type,
      has_elevator: d.tags.includes('有电梯'),
      facilities: d.facilities,
      rent: d.price.rent,
      deposit: d.price.deposit,
      available_date: d.spec.available_date,
      min_lease_months: d.spec.min_lease_months,
    })
    images.value = d.images.map((url) => url.replace('/mock-files/', ''))
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

async function onUpload(file: File) {
  uploading.value = true
  try {
    const res = await upload(file, 'listing_image')
    images.value.push(res.object_key)
    message.success(`已上传 ${res.file_name ?? '图片'}`)
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    uploading.value = false
    return false
  }
}

async function save() {
  if (!form.title.trim() || !form.address.trim()) {
    message.warning('请填写标题与详细地址')
    return
  }
  saving.value = true
  try {
    const payload: ListingWriteReq = { ...form, images: images.value }
    if (isEdit.value && id.value !== null) {
      await listingApi.update(id.value, payload)
      message.success('已保存')
    } else {
      const res = await listingApi.create(payload)
      message.success('已创建（默认下架，需手动上架）')
      await router.replace(`/merchant/listings/${res.id}/edit`)
      return
    }
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    saving.value = false
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
    message.success('已生成候选文案，点选即可填入')
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
  <a-spin :spinning="loading">
    <div class="rh-section-title">
      <h1 style="font-size: 22px; margin: 0">{{ isEdit ? '编辑房源' : '新建房源' }}</h1>
      <a-space>
        <a-button @click="router.push('/merchant/listings')">返回列表</a-button>
        <a-button type="primary" :loading="saving" @click="save">保存</a-button>
      </a-space>
    </div>

    <a-form layout="vertical" :model="form">
      <a-card title="基本信息">
        <a-row :gutter="16">
          <a-col :xs="24" :md="12">
            <a-form-item label="标题" required>
              <a-input v-model:value="form.title" :maxlength="60" show-count />
            </a-form-item>
          </a-col>
          <a-col :xs="12" :md="6">
            <a-form-item label="房型">
              <a-select v-model:value="form.house_type" :options="houseTypeOptions" />
            </a-form-item>
          </a-col>
          <a-col :xs="12" :md="6">
            <a-form-item label="租赁类型">
              <a-select
                v-model:value="form.rent_type"
                :options="[
                  { value: 'whole', label: '整租' },
                  { value: 'shared', label: '合租' },
                ]"
              />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item label="房源描述">
              <a-textarea v-model:value="form.description" :rows="4" />
              <a-button size="small" style="margin-top: 8px" @click="genCopy('description')">AI 生成描述</a-button>
            </a-form-item>
          </a-col>
        </a-row>
        <a-alert v-for="c in copyCandidates" :key="c.text" :message="c.text" type="info" style="margin-bottom: 8px" @click="useCandidate(c.text)" />
      </a-card>

      <a-card title="位置与交通" style="margin-top: 16px">
        <a-row :gutter="16">
          <a-col :xs="24" :md="6">
            <a-form-item label="区域" required>
              <a-select v-model:value="form.region_code" :options="regionOptions" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="6">
            <a-form-item label="小区">
              <a-input v-model:value="form.community" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :md="12">
            <a-form-item label="详细地址" required>
              <a-input v-model:value="form.address" />
            </a-form-item>
          </a-col>
          <a-col :xs="12" :md="6">
            <a-form-item label="地铁线路">
              <a-select v-model:value="form.metro_line" allow-clear :options="metroOptions" />
            </a-form-item>
          </a-col>
          <a-col :xs="12" :md="6">
            <a-form-item label="步行分钟">
              <a-input-number v-model:value="form.walk_minutes" :min="0" :max="60" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-card>

      <a-card title="户型与配套" style="margin-top: 16px">
        <a-row :gutter="16">
          <a-col :xs="8" :md="3"><a-form-item label="室"><a-input-number v-model:value="form.rooms" :min="1" :max="9" style="width: 100%" /></a-form-item></a-col>
          <a-col :xs="8" :md="3"><a-form-item label="厅"><a-input-number v-model:value="form.halls" :min="0" :max="5" style="width: 100%" /></a-form-item></a-col>
          <a-col :xs="8" :md="3"><a-form-item label="卫"><a-input-number v-model:value="form.baths" :min="0" :max="5" style="width: 100%" /></a-form-item></a-col>
          <a-col :xs="12" :md="4"><a-form-item label="面积（㎡）"><a-input-number v-model:value="form.area" :min="5" :max="999" style="width: 100%" /></a-form-item></a-col>
          <a-col :xs="12" :md="4"><a-form-item label="楼层 / 总层">
            <a-space>
              <a-input-number v-model:value="form.floor" :min="-3" :max="99" />
              <a-input-number v-model:value="form.total_floor" :min="1" :max="99" />
            </a-space>
          </a-form-item></a-col>
          <a-col :xs="12" :md="3"><a-form-item label="朝向"><a-select v-model:value="form.orientation" :options="orientationOptions" /></a-form-item></a-col>
          <a-col :xs="12" :md="4"><a-form-item label="装修"><a-select v-model:value="form.decoration" :options="decorationOptions" /></a-form-item></a-col>
          <a-col :xs="24" :md="6">
            <a-form-item label="设施">
              <a-select v-model:value="form.facilities!.bed" mode="multiple" :options="bedOptions" placeholder="室内" />
              <a-select v-model:value="form.facilities!.public" mode="multiple" :options="publicOptions" placeholder="公共" style="margin-top: 6px" />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item label="电梯">
              <a-switch v-model:checked="form.has_elevator" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-card>

      <a-card title="租金与租约" style="margin-top: 16px">
        <a-row :gutter="16">
          <a-col :xs="12" :md="6"><a-form-item label="月租（分）"><a-input-number v-model:value="form.rent" :min="1" :step="10000" style="width: 100%" /></a-form-item></a-col>
          <a-col :xs="12" :md="6"><a-form-item label="押金（分）"><a-input-number v-model:value="form.deposit" :min="0" :step="10000" style="width: 100%" /></a-form-item></a-col>
          <a-col :xs="12" :md="6"><a-form-item label="可入住日期"><a-input v-model:value="form.available_date" type="date" /></a-form-item></a-col>
          <a-col :xs="12" :md="6"><a-form-item label="最短租期（月）"><a-input-number v-model:value="form.min_lease_months" :min="1" :max="24" style="width: 100%" /></a-form-item></a-col>
        </a-row>
        <div class="rh-muted">金额单位是「分」：300000 = 3000.00 元（与后端 DDL 一致）</div>
      </a-card>

      <a-card title="图片" style="margin-top: 16px">
        <a-space wrap>
          <div v-for="(key, i) in images" :key="key" style="position: relative">
            <img :src="`/mock-files/${key}`" alt="" style="width: 120px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid var(--rh-border)" />
            <a-button size="small" danger style="position: absolute; top: 4px; right: 4px" @click="images.splice(i, 1)">×</a-button>
          </div>
        </a-space>
        <div style="margin-top: 10px">
          <input type="file" accept="image/jpeg,image/png" :disabled="uploading" @change="(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void onUpload(f) }" />
          <div class="rh-muted">支持 jpg / png，单张不超过 5MB；第一张为封面</div>
        </div>
      </a-card>
    </a-form>
  </a-spin>
</template>
