<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { merchantApi, upload } from '@/api'
import { QUALIFICATION_STATUS, dateTime } from '@/utils/format'

const status = ref('not_submitted')
const legalName = ref('')
const files = ref<string[]>([])
const existing = ref<{ url: string; file_name?: string }[]>([])
const rejectReason = ref<string | null>(null)
const submittedAt = ref<string | null>(null)
const loading = ref(true)
const saving = ref(false)
const uploading = ref(false)

const form = reactive({})

const STATUS_HINT: Record<string, string> = {
  not_submitted: '尚未提交资质，提交后需管理员审核，通过后才能上架房源',
  pending: '资质已提交，等待管理员审核',
  approved: '资质已通过，可以发布与上架房源',
  rejected: '资质被驳回，请根据原因修改后重新提交',
}

async function load() {
  loading.value = true
  try {
    const q = await merchantApi.qualification()
    status.value = q.status
    legalName.value = q.legal_name ?? ''
    existing.value = q.files ?? []
    rejectReason.value = q.reject_reason ?? null
    submittedAt.value = q.submitted_at ?? null
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

async function onUpload(file: File) {
  uploading.value = true
  try {
    const res = await upload(file, 'qualification')
    files.value.push(res.object_key)
    message.success(`已上传 ${res.file_name ?? '材料'}`)
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    uploading.value = false
    return false
  }
}

async function submit() {
  if (legalName.value.trim().length < 2) {
    message.warning('请填写主体名称（至少 2 个字）')
    return
  }
  if (!files.value.length && !existing.value.length) {
    message.warning('请至少上传 1 张资质材料')
    return
  }
  saving.value = true
  try {
    await merchantApi.saveQualification({ legal_name: legalName.value.trim(), files: files.value.length ? files.value : existing.value.map((f) => f.url.replace('/mock-files/', '')) })
    message.success('资质已提交，等待审核')
    files.value = []
    await load()
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <a-spin :spinning="loading">
    <h1 style="font-size: 22px; margin: 0 0 12px">商家信息与资质</h1>

    <a-alert
      :type="status === 'approved' ? 'success' : status === 'rejected' ? 'error' : status === 'pending' ? 'warning' : 'info'"
      :message="`当前状态：${QUALIFICATION_STATUS[status]?.text ?? status}`"
      :description="STATUS_HINT[status]"
      show-icon
      style="margin-bottom: 16px"
    />
    <a-alert v-if="rejectReason" type="error" :message="`驳回原因：${rejectReason}`" style="margin-bottom: 16px" />
    <div v-if="submittedAt" class="rh-muted" style="margin-bottom: 16px">最近提交：{{ dateTime(submittedAt) }}</div>

    <a-card title="提交 / 更新资质">
      <a-form layout="vertical" :model="form">
        <a-form-item label="主体名称" required>
          <a-input v-model:value="legalName" placeholder="例如：星辰公寓管理（大连）有限公司" :maxlength="64" />
        </a-form-item>

        <a-form-item label="资质材料">
          <a-space wrap>
            <div v-for="f in existing" :key="f.url">
              <img :src="f.url" alt="" style="width: 110px; height: 84px; object-fit: cover; border: 1px solid var(--rh-border); border-radius: 6px" />
              <div class="rh-muted" style="text-align: center">{{ f.file_name ?? '材料' }}</div>
            </div>
            <div v-for="(key, i) in files" :key="key">
              <img :src="`/mock-files/${key}`" alt="" style="width: 110px; height: 84px; object-fit: cover; border: 1px solid var(--rh-border); border-radius: 6px" />
              <a-button size="small" danger block @click="files.splice(i, 1)">移除</a-button>
            </div>
          </a-space>
          <div style="margin-top: 10px">
            <input type="file" accept="image/jpeg,image/png" :disabled="uploading" @change="(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void onUpload(f) }" />
            <div class="rh-muted">营业执照、法人身份证等，jpg / png，单张不超过 5MB</div>
          </div>
        </a-form-item>

        <a-button type="primary" :loading="saving" @click="submit">提交审核</a-button>
      </a-form>
    </a-card>

    <a-card title="审核记录" style="margin-top: 16px">
      <a-empty v-if="!submittedAt" description="还没有提交记录" />
      <a-timeline v-else>
        <a-timeline-item v-if="submittedAt" color="blue">提交资质 · {{ dateTime(submittedAt) }}</a-timeline-item>
        <a-timeline-item v-if="status === 'approved'" color="green">管理员审核通过</a-timeline-item>
        <a-timeline-item v-if="status === 'rejected'" color="red">管理员驳回：{{ rejectReason }}</a-timeline-item>
        <a-timeline-item v-if="status === 'pending'" color="gray">等待管理员审核</a-timeline-item>
      </a-timeline>
    </a-card>
  </a-spin>
</template>
