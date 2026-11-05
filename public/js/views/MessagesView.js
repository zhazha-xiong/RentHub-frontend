/**
 * 通知中心（v2 messages.html）
 */
import { ref, computed, watch, useRoute, useRouter } from '../lib.js';
import { api } from '../api.js';
import { setCounts, toast } from '../store.js';

export default {
  name: 'MessagesView',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const data = ref({ items: [], tabs: [], unread: 0 });
    const loading = ref(true);
    const tab = computed(() => route.query.tab || 'all');

    async function load() {
      loading.value = true;
      try {
        const res = await api.messages(tab.value);
        data.value = res;
        setCounts({ messages: res.unread });
      } catch (e) {
        toast(e.message || '通知加载失败', 'err');
        if (e.code === 'unauth') router.push({ path: '/login', query: { role: 'tenant', from: route.fullPath } });
      } finally {
        loading.value = false;
      }
    }
    watch(() => route.fullPath, load, { immediate: true });

    function setTab(key) {
      router.replace({ path: '/messages', query: key === 'all' ? {} : { tab: key } });
    }

    async function readAll() {
      try {
        const res = await api.readAllMessages();
        if (res.counts) setCounts(res.counts);
        toast('已全部标为已读', 'ok');
        await load();
      } catch (e) {
        toast(e.message || '操作失败', 'err');
      }
    }

    return { data, loading, tab, setTab, readAll };
  },
  template: `
  <div class="head">
    <h1>通知中心<span class="unread-chip" v-if="data.unread">{{ data.unread }} 条未读</span></h1>
    <div class="right"><button class="btn ghost sm" :disabled="!data.unread" @click="readAll">全部标为已读</button></div>
  </div>
  <nav class="tabs">
    <a v-for="t in data.tabs" :key="t.key" href="#" :class="{ on: tab === t.key }" @click.prevent="setTab(t.key)">{{ t.label }}</a>
  </nav>

  <div v-if="loading" class="page-loading">正在加载通知…</div>
  <template v-else>
    <article class="note" v-for="m in data.items" :key="m.id" :class="{ unread: m.unread }">
      <span class="dot" aria-hidden="true"></span>
      <div class="nb">
        <p class="nt">{{ m.title }}</p>
        <p class="nx">{{ m.body }}</p>
      </div>
      <time class="tm">{{ m.time }}</time>
    </article>
    <p class="empty" v-if="!data.items.length">暂时没有通知。</p>
  </template>
  `,
};
