<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { adminApi } from '@/api'
import type { QualificationItem } from '@/api/types'
import { QUALIFICATION_STATUS, dateTime } from '@/utils/format'

const rows = ref<QualificationItem[]>([])
const loading = ref(true)
const status = ref<string>('pending')

const modalOpen = ref(false)
const target = ref<QualificationItem | null>(null)
const reason = ref('')
const reasonError = ref('')
const submitting = ref(false)

const columns = [
  { title: '商家', key: 'merchant' },
  { title: '主体名称', key: 'legal' },
  { title: '材料', key: 'files', width: 170 },
  { title: '提交时间', key: 'submitted', width: 170 },
  { title: '状态', key: 'status', width: 110 },
  { title: '操作', key: 'action', width: 200 },
]

async function load() {
  loading.value = true
  try {
    const data = await adminApi.qualifications(status.value === 'all' ? undefined : status.value)
    rows.value = data.items
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

async function approve(row: QualificationItem) {
  try {
    await adminApi.approve(row.id)
    message.success('已通过审核')
    await load()
  } catch (err) {
    message.error((err as Error).message)
  }
}

function openReject(row: QualificationItem) {
  target.value = row
  reason.value = ''
  reasonError.value = ''
  modalOpen.value = true
}

async function submitReject() {
  if (!target.value) return
  const text = reason.value.trim()
  if (text.length < 10) {
    reasonError.value = '驳回原因不少于 10 个字'
    return
  }
  submitting.value = true
  try {
    await adminApi.reject(target.value.id, text)
    message.success('已驳回')
    modalOpen.value = false
    await load()
  } catch (err) {
    reasonError.value = (err as Error).message
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="rh-section-title">
      <h1 style="font-size: 22px; margin: 0">资质审核</h1>
      <a-space>
        <a-select
          v-model:value="status"
          style="width: 160px"
          :options="[
            { value: 'pending', label: '待审核' },
            { value: 'approved', label: '已通过' },
            { value: 'rejected', label: '已驳回' },
            { value: 'all', label: '全部' },
          ]"
          @change="load"
        />
        <a-button @click="load">刷新</a-button>
      </a-space>
    </div>

    <a-table :columns="columns" :data-source="rows" :loading="loading" row-key="id" :pagination="false">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'merchant'">
          <div style="font-weight: 600">{{ record.merchant_name }}</div>
        </template>
        <template v-else-if="column.key === 'legal'">{{ record.legal_name || '—' }}</template>
        <template v-else-if="column.key === 'files'">
          <a-image-preview-group>
            <a-image
              v-for="f in record.files"
              :key="f.id"
              :src="f.url"
              :width="42"
              :height="32"
              style="object-fit: cover; margin-right: 4px"
            />
          </a-image-preview-group>
          <span v-if="!record.files?.length" class="rh-muted">无</span>
        </template>
        <template v-else-if="column.key === 'submitted'">{{ dateTime(record.submitted_at) }}</template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="QUALIFICATION_STATUS[record.status]?.color">{{ QUALIFICATION_STATUS[record.status]?.text ?? record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space v-if="record.status === 'pending'">
            <a-button size="small" type="primary" @click="approve(record as QualificationItem)">通过</a-button>
            <a-button size="small" danger @click="openReject(record as QualificationItem)">驳回</a-button>
          </a-space>
          <span v-else class="rh-muted">{{ record.reject_reason ?? '—' }}</span>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalOpen" title="驳回资质" ok-text="确认驳回" cancel-text="取消" :confirm-loading="submitting" @ok="submitReject">
      <p class="rh-muted">驳回原因会展示给商家，请写清需要补充或修改的材料（不少于 10 个字）。</p>
      <a-textarea v-model:value="reason" :rows="4" :maxlength="255" show-count placeholder="例如：营业执照照片不清晰，请重新上传彩色原件" />
      <div v-if="reasonError" style="color: #e5484d; margin-top: 8px; font-size: 13px">{{ reasonError }}</div>
    </a-modal>
  </div>
</template>
