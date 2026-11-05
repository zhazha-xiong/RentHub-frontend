/**
 * AI 找房（v2 agent.html）
 *
 * 排版不变：.crumbs / .head / .chatwrap(.chat .thread .msg + .composer, aside.side)。
 * 对话与「本次候选」都由 /api/agent 提供，前端只负责追加用户选择。
 */
import { ref, watch, nextTick, useRoute } from '../lib.js';
import { api } from '../api.js';
import { toast } from '../store.js';

export default {
  name: 'AgentView',
  setup() {
    const route = useRoute();
    const data = ref(null);
    const loading = ref(true);
    const threadEl = ref(null);
    const input = ref('');
    /** 用户点选后追加的轮次：{ text, options? } */
    const extra = ref([]);

    async function load() {
      loading.value = true;
      try {
        data.value = await api.agent();
      } catch (e) {
        toast(e.message || 'AI 会话加载失败', 'err');
      } finally {
        loading.value = false;
      }
    }
    watch(() => route.name, () => { if (route.name === 'agent') load(); }, { immediate: true });

    const scrollBottom = () => nextTick(() => {
      if (threadEl.value) threadEl.value.lastElementChild?.scrollIntoView({ block: 'nearest' });
    });

    /** 点击候选选项 = 发一条用户消息（与原页 app.js 行为一致：已作答的组置灰） */
    function pick(msgIdx, opt) {
      const text = String(opt.text).replace(/\s*·\s*\d+\s*套$/, '').trim();
      extra.value.push({ afterIndex: msgIdx, text });
      scrollBottom();
    }

    function answered(msgIdx) {
      return extra.value.some((x) => x.afterIndex === msgIdx);
    }

    function send() {
      const t = input.value.trim();
      if (!t) return;
      extra.value.push({ afterIndex: -1, text: t });
      input.value = '';
      scrollBottom();
    }

    function onEnter(e) {
      if (e.isComposing) return;
      if (!e.shiftKey) send();
    }

    return { data, loading, threadEl, input, extra, pick, answered, send, onEnter };
  },
  template: `
  <div class="crumbs"><RouterLink to="/">找房</RouterLink><span>/</span>AI 找房</div>
  <div class="head">
    <div>
      <h1>AI 找房</h1>
    </div>
    <div class="right"><RouterLink class="btn ghost" to="/" style="display:inline-flex;align-items:center;text-decoration:none">回到列表</RouterLink></div>
  </div>

  <div class="chatwrap">
    <div class="chat">
      <div class="thread" ref="threadEl">
        <template v-if="data">
          <template v-for="(m, i) in data.thread" :key="i">
            <div class="msg user" v-if="m.role === 'user'">
              <p class="who"><span class="ava-u">{{ m.avatar || '肖' }}</span></p>
              <div class="bubble">{{ m.text }}</div>
            </div>

            <div class="msg agent" v-else>
              <p class="who"><span class="ava-a">助</span>找房助手</p>
              <div class="bubble">
                <span v-html="m.text"></span>
                <div class="mini" v-if="m.minis && m.minis.length">
                  <RouterLink v-for="x in m.minis" :key="x.id" :to="'/house/' + x.id">
                    <img :src="x.img" alt="" loading="lazy">
                    <div class="b"><p class="t">{{ x.title }}</p><p class="p"><b>{{ x.rentText }}</b> 元/月</p></div>
                  </RouterLink>
                </div>
              </div>
              <div class="q" v-if="m.options && m.options.length" :class="{ done: answered(i) }">
                <button v-for="(o, j) in m.options" :key="j" :class="{ skip: o.skip }"
                  :aria-disabled="answered(i) ? 'true' : 'false'" @click="!answered(i) && pick(i, o)">{{ o.text }}</button>
              </div>
              <p class="hint" v-if="m.hint">{{ m.hint }}</p>
            </div>

            <template v-for="(x, k) in extra.filter(e => e.afterIndex === i)" :key="'x' + k">
              <div class="msg user">
                <p class="who"><span class="ava-u">肖</span></p>
                <div class="bubble">{{ x.text }}</div>
              </div>
            </template>
          </template>

          <div class="msg user" v-for="(x, k) in extra.filter(e => e.afterIndex === -1)" :key="'z' + k">
            <p class="who"><span class="ava-u">肖</span></p>
            <div class="bubble">{{ x.text }}</div>
          </div>
        </template>
        <div class="page-loading" v-else-if="loading">正在加载会话…</div>
      </div>

      <form class="composer" @submit.prevent="send">
        <textarea aria-label="继续提问" placeholder="继续问，例如「这两套哪个更划算」" v-model="input" @keydown.enter.prevent="onEnter"></textarea>
        <button class="btn send" type="submit">发送</button>
      </form>
      <p class="hint">{{ (data && data.hint) || 'Enter 发送 · Shift + Enter 换行 · 回答基于房源结构化字段与平台统计' }}</p>
    </div>

    <aside class="side">
      <div class="hd"><b>{{ (data && data.sideTitle) || '本次候选' }}</b><span>{{ (data && data.sideCount) || '' }}</span></div>
      <RouterLink class="result" v-for="c in (data ? data.candidates : [])" :key="c.id" :to="'/house/' + c.id" style="text-decoration:none;color:inherit">
        <img :src="c.cover" alt="">
        <div><p class="t">{{ c.title }}</p><p class="m">{{ c.meta }}</p><p class="p"><b>{{ c.rentText }}</b> 元/月</p></div>
      </RouterLink>
      <button class="btn ghost" style="width:100%;margin-top:12px">生成对比表</button>
    </aside>
  </div>
  `,
};
