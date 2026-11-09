<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { streamChat } from '@/api/sse'
import { ApiError } from '@/api/http'
import type { ListingCard } from '@/api/types'
import ListingCardView from '@/components/ListingCard.vue'
import { useAuthStore } from '@/stores/auth'
import { money } from '@/utils/format'

interface Bubble {
  role: 'user' | 'assistant'
  text: string
  cards?: ListingCard[]
  options?: { group: string; items: { label: string; value: string }[] }
  conditions?: Record<string, unknown>
  streaming?: boolean
}

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const input = ref('')
const sending = ref(false)
const sessionId = ref<number | null>(null)
const bubbles = ref<Bubble[]>([])
const listRef = ref<HTMLElement | null>(null)

const listingId = route.query.listing_id ? Number(route.query.listing_id) : undefined

const SUGGESTIONS = [
  '沙河口 两室 3000 以内 有电梯',
  '高新园区 合租 1500 以内',
  '近地铁 两室 4000 以内',
  '中山区 三室 带车位',
]

function scrollToBottom() {
  void nextTick(() => {
    listRef.value?.scrollTo({ top: listRef.value.scrollHeight, behavior: 'smooth' })
  })
}

async function send(text?: string) {
  const content = (text ?? input.value).trim()
  if (!content || sending.value) return
  if (!auth.isLoggedIn) {
    void router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }

  input.value = ''
  bubbles.value.push({ role: 'user', text: content })
  const reply: Bubble = { role: 'assistant', text: '', streaming: true }
  bubbles.value.push(reply)
  sending.value = true
  scrollToBottom()

  try {
    await streamChat(
      {
        session_id: sessionId.value ?? undefined,
        scene: 'find_house',
        message: content,
        listing_id: listingId,
      },
      {
        onDelta: (delta) => {
          reply.text += delta
          scrollToBottom()
        },
        onConditions: (conditions) => {
          reply.conditions = conditions
        },
        onOptions: (group, items) => {
          reply.options = { group, items }
        },
        onCards: (items) => {
          reply.cards = items
        },
        onError: (err) => {
          message.error(err.message)
        },
      },
    )
  } catch (err) {
    const apiErr = err as ApiError
    message.error(apiErr.message || '对话失败，请稍后重试')
    if (!reply.text) reply.text = '（本次回答失败，请重试）'
  } finally {
    reply.streaming = false
    sending.value = false
    scrollToBottom()
  }
}

function conditionText(cond?: Record<string, unknown>) {
  if (!cond) return ''
  const map: Record<string, string> = { region: '区域', rooms: '室数', rentMax: '预算上限', hasElevator: '电梯', nearMetro: '近地铁' }
  return Object.entries(cond)
    .filter(([k]) => map[k])
    .map(([k, v]) => (k === 'rentMax' ? `${map[k]} ${money(Number(v))} 元` : `${map[k]} ${String(v)}`))
    .join(' · ')
}

onMounted(() => {
  if (listingId) {
    bubbles.value.push({ role: 'assistant', text: '我可以基于这套房源帮你比较同区域的租金与相似房源，直接问我就行。' })
  } else {
    bubbles.value.push({
      role: 'assistant',
      text: '你好，我是找房助手。告诉我区域、预算、户型、是否要电梯，我会帮你筛选并在详情里做对比。',
    })
  }
})
</script>

<template>
  <a-row :gutter="20">
    <a-col :xs="24" :md="16">
      <a-card :body-style="{ padding: 0 }">
        <template #title>AI 找房</template>
        <template #extra>
          <a-tag v-if="sessionId" color="blue">会话 #{{ sessionId }}</a-tag>
        </template>

        <div ref="listRef" class="chat-body">
          <div v-for="(b, i) in bubbles" :key="i" class="chat-row" :class="b.role">
            <a-avatar :style="{ background: b.role === 'user' ? '#8c8c8c' : 'var(--rh-primary)', flex: '0 0 auto' }">
              {{ b.role === 'user' ? auth.initial : 'AI' }}
            </a-avatar>
            <div class="chat-main">
              <div class="chat-bubble" :class="b.role">
                {{ b.text }}<span v-if="b.streaming" class="caret">▍</span>
              </div>
              <div v-if="b.conditions && Object.keys(b.conditions).length" class="rh-muted" style="margin-top: 6px">
                已识别条件：{{ conditionText(b.conditions) }}
              </div>
              <div v-if="b.options" style="margin-top: 8px">
                <div class="rh-muted">选择{{ b.options.group }}：</div>
                <a-space wrap style="margin-top: 6px">
                  <a-button v-for="opt in b.options.items" :key="opt.value" size="small" @click="send(opt.value)">
                    {{ opt.label }}
                  </a-button>
                </a-space>
              </div>
              <div v-if="b.cards?.length" class="rh-grid" style="margin-top: 10px">
                <ListingCardView v-for="card in b.cards" :key="card.id" :listing="card" />
              </div>
            </div>
          </div>
        </div>

        <div class="chat-input">
          <a-textarea
            v-model:value="input"
            :auto-size="{ minRows: 1, maxRows: 4 }"
            placeholder="例如：沙河口 两室 3000 以内 有电梯（Enter 发送，Shift+Enter 换行）"
            @press-enter="send()"
          />
          <a-button type="primary" :loading="sending" @click="send()">发送</a-button>
        </div>
      </a-card>
    </a-col>

    <a-col :xs="24" :md="8">
      <a-card title="可以这样问">
        <a-space direction="vertical" style="width: 100%">
          <a-button v-for="s in SUGGESTIONS" :key="s" block style="text-align: left" @click="send(s)">{{ s }}</a-button>
        </a-space>
        <a-divider />
        <div class="rh-muted">
          回答来自规则式条件抽取 + 房源检索（假后端实现）。真后端由大模型按 SSE 返回同样的
          <code>delta / conditions / options / cards / done</code> 事件，前端无需改动。
        </div>
      </a-card>
    </a-col>
  </a-row>
</template>

<style scoped>
.chat-body {
  height: 520px;
  overflow-y: auto;
  padding: 16px;
  background: #fafafa;
}
.chat-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.chat-row.user {
  flex-direction: row-reverse;
}
.chat-main {
  max-width: 82%;
}
.chat-bubble {
  background: #fff;
  border: 1px solid var(--rh-border);
  border-radius: 10px;
  padding: 10px 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.chat-bubble.user {
  background: var(--rh-primary);
  border-color: var(--rh-primary);
  color: #fff;
}
.caret {
  animation: blink 1s step-end infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
.chat-input {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--rh-border);
  background: #fff;
}
</style>
