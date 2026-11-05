/**
 * 我的订单（v2 orders.html）
 * tab 状态写在 URL（?tab=pending），刷新/后退都停在同一页签上。
 */
import { ref, computed, watch, useRoute, useRouter } from '../lib.js';
import { api } from '../api.js';
import { setCounts, toast } from '../store.js';

export default {
  name: 'OrdersView',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const data = ref({ items: [], tabs: [], counts: null });
    const loading = ref(true);
    const busy = ref('');

    const tab = computed(() => route.query.tab || 'all');

    async function load() {
      loading.value = true;
      try {
        const res = await api.orders(tab.value);
        data.value = res;
        if (res.counts) setCounts(res.counts);
      } catch (e) {
        toast(e.message || '订单加载失败', 'err');
        if (e.code === 'unauth') router.push({ path: '/login', query: { role: 'tenant', from: route.fullPath } });
      } finally {
        loading.value = false;
      }
    }
    watch(() => route.fullPath, load, { immediate: true });

    function setTab(key) {
      router.replace({ path: '/orders', query: key === 'all' ? {} : { tab: key } });
    }

    async function cancel(o) {
      if (busy.value) return;
      busy.value = o.no;
      try {
        const res = await api.cancelOrder(o.no);
        if (res.counts) setCounts(res.counts);
        toast(`订单 ${o.no} 已取消`, 'ok');
        await load();
      } catch (e) {
        toast(e.message || '取消失败', 'err');
      } finally {
        busy.value = '';
      }
    }

    const contact = () => toast('演示环境：已向商家发送联系请求', 'ok');

    return { data, loading, tab, busy, setTab, cancel, contact };
  },
  template: `
  <h1>我的订单</h1>
  <nav class="tabs">
    <a v-for="t in data.tabs" :key="t.key" href="#" :class="{ on: tab === t.key }" @click.prevent="setTab(t.key)">{{ t.label }} <span class="n">{{ t.n }}</span></a>
  </nav>

  <div v-if="loading" class="page-loading">正在加载订单…</div>
  <template v-else>
    <article class="order" v-for="o in data.items" :key="o.no">
      <div class="top">
        <span>订单号 {{ o.no }}</span><span>{{ o.createdAt }}</span>
        <span class="st"><span class="tag" :class="o.stateKind">{{ o.stateLabel }}</span></span>
      </div>
      <div class="body">
        <img :src="o.house.img" alt="">
        <div>
          <p class="t">{{ o.house.title }}</p>
          <p class="m">{{ o.house.meta }}</p>
          <p class="m">租期 {{ o.months }} 个月 · 入住 {{ o.checkIn }}</p>
        </div>
        <div class="amt"><b>{{ fmt(o.total) }}</b><p>含押金 {{ fmt(o.deposit) }}</p></div>
      </div>
      <div class="foot">
        <template v-if="o.state === 'pending'">
          <button class="btn ghost sm" :disabled="busy === o.no" @click="cancel(o)">{{ busy === o.no ? '处理中…' : '取消订单' }}</button>
          <button class="btn sm" @click="contact">联系商家</button>
        </template>
        <template v-else-if="o.state === 'confirmed'">
          <button class="btn ghost sm" disabled>取消订单</button>
          <button class="btn sm" @click="contact">联系商家</button>
        </template>
        <template v-else-if="o.state === 'done'">
          <button class="btn ghost sm" @click="$router.push('/house/' + o.houseId)">查看详情</button>
        </template>
        <template v-else>
          <button class="btn ghost sm" @click="contact">退款记录</button>
        </template>
      </div>
    </article>
    <p class="empty" v-if="!data.items.length">这个分类下还没有订单。</p>
  </template>
  `,
};
