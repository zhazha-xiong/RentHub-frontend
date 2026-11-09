<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { merchantApi, upload } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { QUALIFICATION_STATUS, dateOnly } from '@/utils/format'

/**
 * 商家 · 信息与资质 —— 结构沿用 v2 merchant-profile.html：
 *   .form（左：店铺信息 .fieldset + 资质材料 .fieldset + 审核记录 table；右：.summary 状态与提交）
 */
const auth = useAuthStore()

const status = ref('not_submitted')
const legalName = ref('')
const files = ref<string[]>([])
const existing = ref<{ url: string; file_name?: string }[]>([])
const rejectReason = ref<string | null>(null)
const submittedAt = ref<string | null>(null)
const reviewedAt = ref<string | null>(null)
const onlineCount = ref(0)

const loading = ref(true)
const saving = ref(false)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const STATUS_HINT: Record<string, string> = {
  not_submitted: '尚未提交资质，提交后需管理员审核，通过后才能上架房源',
  pending: '资质已提交，等待管理员审核',
  approved: '资质已通过，可以发布与上架房源',
  rejected: '资质被驳回，请根据原因修改后重新提交',
}

/** 状态 → v2 现有的 tag 变体 */
const STATUS_TAG: Record<string, string> = {
  not_submitted: 'tag plain',
  pending: 'tag warn',
  approved: 'tag ok',
  rejected: 'tag warn',
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
    reviewedAt.value = (q as { reviewed_at?: string | null }).reviewed_at ?? null
    const summary = await merchantApi.summary().catch(() => null)
    onlineCount.value = summary?.online ?? 0
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
    const res = await upload(file, 'qualification')
    files.value.push(res.object_key)
    message.success(`已上传 ${res.file_name ?? '材料'}`)
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    uploading.value = false
    input.value = ''
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
    await merchantApi.saveQualification({
      legal_name: legalName.value.trim(),
      files: files.value.length ? files.value : existing.value.map((f) => f.url.replace('/mock-files/', '')),
    })
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
  <div>
    <h1>商家信息与资质</h1>

    <p v-if="loading" class="loading-hint">正在加载资质信息…</p>

    <div v-else class="form">
      <div>
        <div class="fieldset">
          <h2>店铺信息</h2>
          <div class="grid2">
            <div class="field">
              <label for="shop">店铺名称</label>
              <input id="shop" type="text" :value="auth.user?.nickname ?? ''" disabled />
            </div>
            <div class="field">
              <label for="tel">联系电话</label>
              <input id="tel" type="text" :value="auth.user?.phone ?? '未填写'" disabled />
            </div>
            <div class="field wide">
              <label for="legal">主体名称（提交资质用）</label>
              <input id="legal" v-model="legalName" type="text" :maxlength="64" placeholder="例如：星辰公寓管理（大连）有限公司" />
            </div>
          </div>
          <p class="hint">店铺名称与电话请在「个人信息」里维护；演示环境暂不提供店铺简介接口。</p>
        </div>

        <div class="fieldset">
          <h2>资质材料</h2>
          <p class="hint" style="margin: 0 0 10px">
            营业执照 · 法人身份证 · 支持 jpg/png，单张不超过 5MB · 已上传 {{ existing.length + files.length }} 张
          </p>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px">
            <div v-for="f in existing" :key="f.url">
              <img :src="f.url" :alt="f.file_name ?? '资质材料'" style="width: 100%; aspect-ratio: 4/3; object-fit: cover; border: 1px solid var(--border-2); border-radius: var(--r-ctl)" />
              <p class="hint" style="margin-top: 4px">{{ f.file_name ?? '材料' }}</p>
            </div>
            <div v-for="(key, i) in files" :key="key">
              <img :src="`/mock-files/${key}`" alt="待提交材料" style="width: 100%; aspect-ratio: 4/3; object-fit: cover; border: 1px solid var(--border-2); border-radius: var(--r-ctl)" />
              <button class="btn ghost sm" type="button" style="width: 100%; margin-top: 4px" @click="files.splice(i, 1)">移除</button>
            </div>
            <div
              style="aspect-ratio: 4/3; border: 1px dashed var(--border); border-radius: var(--r-ctl); display: grid; place-items: center; color: var(--text-3); font-size: 13px; cursor: pointer"
              @click="fileInput?.click()"
            >
              {{ uploading ? '上传中…' : '上传新材料' }}
            </div>
          </div>
          <input ref="fileInput" type="file" accept="image/jpeg,image/png" hidden :disabled="uploading" @change="pick" />
          <p v-if="rejectReason" class="alert" style="margin-top: 12px">驳回原因：{{ rejectReason }}</p>
        </div>

        <div class="fieldset">
          <h2>审核记录</h2>
          <p v-if="!submittedAt" class="hint">还没有提交记录。</p>
          <table v-else class="table">
            <thead>
              <tr><th>时间</th><th>动作</th><th>材料</th><th>结果</th></tr>
            </thead>
            <tbody>
              <tr v-if="reviewedAt">
                <td>{{ dateOnly(reviewedAt) }}</td>
                <td>管理员审核</td>
                <td>{{ existing.length }} 张</td>
                <td><span :class="STATUS_TAG[status] ?? 'tag'">{{ QUALIFICATION_STATUS[status]?.text ?? status }}</span></td>
              </tr>
              <tr>
                <td>{{ dateOnly(submittedAt) }}</td>
                <td>提交资质</td>
                <td>{{ existing.length }} 张</td>
                <td>
                  <span :class="status === 'pending' ? 'tag plain' : 'tag'">
                    {{ status === 'pending' ? '待审核' : QUALIFICATION_STATUS[status]?.text ?? status }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <aside class="summary">
        <h2>资质状态</h2>
        <p style="margin: 0 0 12px"><span :class="STATUS_TAG[status] ?? 'tag'">{{ QUALIFICATION_STATUS[status]?.text ?? status }}</span></p>
        <div class="row"><span>最近提交</span><b>{{ submittedAt ? dateOnly(submittedAt) : '—' }}</b></div>
        <div class="row"><span>审核时间</span><b>{{ reviewedAt ? dateOnly(reviewedAt) : '—' }}</b></div>
        <div class="row"><span>在架房源</span><b>{{ onlineCount }} 套</b></div>
        <div class="total"><span>可上架</span><b>{{ status === 'approved' ? '可以' : '需先通过审核' }}</b></div>
        <button class="btn" type="button" :disabled="saving" @click="submit">
          {{ saving ? '提交中…' : status === 'approved' ? '保存并重新提交' : '提交审核' }}
        </button>
        <p class="fine">{{ STATUS_HINT[status] }}。更新材料后需重新审核，期间在架房源不受影响。</p>
      </aside>
    </div>
  </div>
</template>
