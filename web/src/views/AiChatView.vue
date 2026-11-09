<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { streamChat } from '@/api/sse'
import { ApiError } from '@/api/http'
import type { ListingCard } from '@/api/types'
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

/** 右栏「本次候选」：取最近一条带卡片的助手消息（与 v2 的 .side 一致） */
const candidates = computed<ListingCard[]>(() => {
  for (let i = bubbles.value.length - 1; i >= 0; i--) {
    const cards = bubbles.value[i].cards
    if (cards?.length) return cards
  }
  return []
})

const SUGGESTIONS = [
  '沙河口 两室 3000 以内 有电梯',
  '高新园区 合租 1500 以内',
  '近地铁 两室 4000 以内',
  '中山区 三室 带车位',
]

/** v2 的对话是整页流（.chat min-height 640），所以滚 window，而不是给内部容器加滚动条 */
function scrollToBottom() {
  void nextTick(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
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
  <!-- 结构与 class 完全沿用 v2 agent.html：.head / .chatwrap(.chat + .side) / .thread / .msg / .composer -->
  <div>
    <p class="crumbs"><router-link to="/">找房</router-link><span>/</span>AI 找房</p>
    <div class="head">
      <div>
        <h1>AI 找房</h1>
      </div>
      <div class="right">
        <router-link class="btn ghost" to="/" style="display: inline-flex; align-items: center; text-decoration: none">回到列表</router-link>
      </div>
    </div>

    <div class="chatwrap">
      <div class="chat">
        <div ref="listRef" class="thread">
          <div v-for="(b, i) in bubbles" :key="i" class="msg" :class="b.role">
            <p class="who">
              <template v-if="b.role === 'user'"><span class="ava-u">{{ auth.initial || '我' }}</span></template>
              <template v-else><span class="ava-a">助</span>找房助手</template>
            </p>
            <div class="bubble">
              {{ b.text }}<span v-if="b.streaming" aria-hidden="true">▍</span>

              <p v-if="b.conditions && Object.keys(b.conditions).length" class="hint">
                已识别条件：{{ conditionText(b.conditions) }}
              </p>

              <div v-if="b.options" class="q">
                <button v-for="opt in b.options.items" :key="opt.value" type="button" @click="send(opt.value)">
                  {{ opt.label }}
                </button>
                <button type="button" class="skip" @click="send('跳过这一步')">跳过</button>
              </div>

              <div v-if="b.cards?.length" class="mini">
                <router-link v-for="card in b.cards.slice(0, 3)" :key="card.id" :to="`/listings/${card.id}`">
                  <img :src="card.cover" :alt="card.title" loading="lazy" />
                  <div class="b">
                    <p class="t">{{ card.title }}</p>
                    <p class="p"><b>{{ money(card.rent) }}</b> 元/月</p>
                  </div>
                </router-link>
              </div>
            </div>

            <!-- 首条助手消息带 4 个建议问法（v2 的点选按钮就是 .q） -->
            <div v-if="i === 0 && !listingId" class="q">
              <button v-for="s in SUGGESTIONS" :key="s" type="button" @click="send(s)">{{ s }}</button>
            </div>
          </div>
        </div>

        <form class="composer" @submit.prevent="send()">
          <textarea
            v-model="input"
            aria-label="继续提问"
            placeholder="继续问，例如「这两套哪个更划算」"
            @keydown.enter.exact.prevent="send()"
          />
          <button class="btn send" type="submit" :disabled="sending">{{ sending ? '回答中…' : '发送' }}</button>
        </form>
        <p class="hint">Enter 发送 · Shift + Enter 换行 · 回答基于房源结构化字段与平台统计</p>
      </div>

      <aside class="side">
        <div class="hd"><b>本次候选</b><span>{{ candidates.length }} 套</span></div>
        <div v-for="c in candidates" :key="c.id" class="result">
          <img :src="c.cover" :alt="c.title" loading="lazy" />
          <div>
            <p class="t">{{ c.title }}</p>
            <p class="m">{{ c.area }}㎡ · {{ c.orientation_name || '—' }} · {{ c.floor_desc }}</p>
            <p class="p"><b>{{ money(c.rent) }}</b> 元/月</p>
          </div>
        </div>
        <p v-if="!candidates.length" class="hint">还没有候选，先告诉助手你的条件。</p>
        <p class="hint" style="margin-top: 12px">
          回答来自规则式条件抽取 + 房源检索（假后端实现）。真后端由大模型按 SSE 返回同样的
          <code>delta / conditions / options / cards / done</code> 事件，前端无需改动。
        </p>
      </aside>
    </div>
  </div>
</template>
