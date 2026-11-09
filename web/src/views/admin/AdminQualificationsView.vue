<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { adminApi } from '@/api'
import type { QualificationItem } from '@/api/types'
import { QUALIFICATION_STATUS, dateTime } from '@/utils/format'

/**
 * 管理员 · 资质审核 —— 结构沿用 v2 admin-review.html：
 *   h1 → .split（左 table.table 列表；右 aside.review-panel 材料 + 通过/驳回）
 */
const rows = ref<QualificationItem[]>([])
const loading = ref(true)
const status = ref<string>('pending')
const selectedId = ref<number | null>(null)

const reason = ref('')
const reasonError = ref('')
const submitting = ref(false)
const acting = ref(false)

const STATUS_TAG: Record<string, string> = {
  not_submitted: 'tag plain',
  pending: 'tag warn',
  approved: 'tag',
  rejected: 'tag plain',
}

const selected = computed(() => rows.value.find((r) => r.id === selectedId.value) ?? null)

async function load() {
  loading.value = true
  try {
    const data = await adminApi.qualifications(status.value === 'all' ? undefined : status.value)
    rows.value = data.items
    if (!rows.value.some((r) => r.id === selectedId.value)) selectedId.value = rows.value[0]?.id ?? null
    reason.value = ''
    reasonError.value = ''
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

async function approve() {
  if (!selected.value) return
  acting.value = true
  try {
    await adminApi.approve(selected.value.id)
    message.success('已通过审核')
    await load()
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    acting.value = false
  }
}

async function reject() {
  if (!selected.value) return
  const text = reason.value.trim()
  if (text.length < 10) {
    reasonError.value = '驳回原因不少于 10 个字'
    return
  }
  submitting.value = true
  try {
    await adminApi.reject(selected.value.id, text)
    message.success('已驳回')
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
    <div class="head">
      <div><h1>资质审核</h1></div>
      <div class="right">
        <select v-model="status" class="select-sm" aria-label="状态筛选" @change="load">
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">已驳回</option>
          <option value="all">全部</option>
        </select>
        <button class="btn ghost sm" type="button" :disabled="loading" @click="load">刷新</button>
      </div>
    </div>

    <p v-if="loading && !rows.length" class="loading-hint">正在加载…</p>
    <p v-else-if="!rows.length" class="empty">当前没有{{ status === 'all' ? '' : QUALIFICATION_STATUS[status]?.text ?? '' }}记录</p>

    <div v-else class="split">
      <div>
        <table class="table">
          <thead>
            <tr><th>商家</th><th>提交时间</th><th>材料</th><th>状态</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.id"
              :aria-current="row.id === selectedId ? 'true' : undefined"
              :style="row.id === selectedId ? { background: 'var(--fill)', cursor: 'pointer' } : { cursor: 'pointer' }"
              @click="selectedId = row.id"
            >
              <td>
                <p>{{ row.merchant_name }}</p>
                <p class="m">{{ row.legal_name || '—' }}</p>
              </td>
              <td>{{ row.submitted_at ? dateTime(row.submitted_at) : '—' }}</td>
              <td>{{ row.files?.length ?? 0 }} 张</td>
              <td>
                <span :class="STATUS_TAG[row.status] ?? 'tag'">{{ QUALIFICATION_STATUS[row.status]?.text ?? row.status }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <aside class="review-panel">
        <template v-if="selected">
          <h2>{{ selected.merchant_name }}</h2>
          <p class="muted-line">
            {{ selected.legal_name || '未填写主体名称' }} · 提交于
            {{ selected.submitted_at ? dateTime(selected.submitted_at) : '—' }}
          </p>

          <div v-if="selected.files?.length" class="shots">
            <a
              v-for="f in selected.files"
              :key="f.id"
              :href="f.url"
              target="_blank"
              rel="noopener"
            >
              <img :src="f.url" :alt="f.file_name ?? '资质材料'" />
            </a>
          </div>
          <p v-else class="hint">该记录没有材料。</p>

          <div class="actions" style="display: flex; gap: 8px; margin-top: 12px">
            <button
              v-if="selected.status === 'pending'"
              class="btn"
              type="button"
              style="flex: 1"
              :disabled="acting"
              @click="approve"
            >
              {{ acting ? '处理中…' : '通过并解锁上架' }}
            </button>
            <button
              v-if="selected.status === 'pending'"
              class="btn ghost"
              type="button"
              style="flex: 1"
              :disabled="submitting"
              @click="reject"
            >
              {{ submitting ? '提交中…' : '驳回' }}
            </button>
          </div>

          <template v-if="selected.status === 'pending'">
            <div class="field" style="margin-top: 14px">
              <label for="reason">驳回原因（通过时可不填）</label>
              <textarea id="reason" v-model="reason" rows="3" placeholder="不少于 10 字，说明需要补正的材料" />
            </div>
            <p v-if="reasonError" class="hint" style="color: var(--danger)">{{ reasonError }}</p>
          </template>

          <p v-else-if="selected.reject_reason" class="alert" style="margin-top: 14px">
            驳回原因：{{ selected.reject_reason }}
          </p>

          <p class="hint">
            通过后商家立即可以上架房源，并会收到一条站内通知。
            <template v-if="selected.reviewed_at">审核时间：{{ dateTime(selected.reviewed_at) }}。</template>
          </p>
        </template>
        <p v-else class="hint">在左侧选择一条记录查看材料。</p>
      </aside>
    </div>
  </div>
</template>
