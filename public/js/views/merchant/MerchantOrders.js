/**
 * 商家端 · 订单管理（v2 merchant-orders.html）
 */
import { ref, computed, watch, useRoute, useRouter } from '../../lib.js';
import { api } from '../../api.js';
import { setMerchantCounts, toast } from '../../store.js';

export default {
  name: 'MerchantOrders',
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
        const res = await api.merchantOrders(tab.value);
        data.value = res;
        if (res.counts) setMerchantCounts(res.counts);
      } catch (e) {
        toast(e.message || '订单加载失败', 'err');
        if (e.code === 'unauth' || e.code === 'forbidden') router.push({ path: '/login', query: { role: 'merchant', from: route.fullPath } });
      } finally {
        loading.value = false;
      }
    }
    watch(() => route.fullPath, load, { immediate: true });

    function setTab(key) {
      router.replace({ path: '/merchant/orders', query: key === 'all' ? {} : { tab: key } });
    }

    async function act(o, action) {
      if (busy.value) return;
      busy.value = o.no;
      try {
        const extra = action === 'reject' ? { reason: '房源已出租，抱歉' } : {};
        const res = await api.merchantOrderAction(o.no, action, extra);
        if (res.counts) setMerchantCounts(res.counts);
        toast(
          action === 'accept' ? `已接单 ${o.no}，房源置为「已出租」`
            : action === 'reject' ? `已拒单 ${o.no}`
              : `订单 ${o.no} 已标记完成`, 'ok',
        );
        await load();
      } catch (e) {
        toast(e.message || '操作失败', 'err');
      } finally {
        busy.value = '';
      }
    }

    return { data, loading, busy, tab, setTab, act };
  },
  template: `
  <h1>订单管理</h1>

  <nav class="tabs">
    <a v-for="t in data.tabs" :key="t.key" href="#" :class="{ on: tab === t.key }" @click.prevent="setTab(t.key)">{{ t.label }} <span class="n">{{ t.n }}</span></a>
  </nav>

  <div v-if="loading" class="page-loading">正在加载订单…</div>
  <template v-else>
    <table class="table">
      <thead><tr><th>订单与房源</th><th>租客</th><th>租期</th><th class="num">金额</th><th>提交时间</th><th>操作</th></tr></thead>
      <tbody>
        <tr v-for="o in data.items" :key="o.no">
          <td><div class="t"><img :src="o.house.img" alt=""><div><p>{{ o.no }}</p><p class="m">{{ o.house.title }}</p></div></div></td>
          <td>{{ o.tenant.name }}<p class="m">{{ o.tenant.phone }}</p></td>
          <td>{{ o.months }} 个月<p class="m">{{ o.checkIn }} 入住</p></td>
          <td class="num">{{ fmt(o.total) }}</td>
          <td>{{ o.createdAt }}</td>
          <td>
            <template v-if="o.state === 'pending'">
              <button class="btn sm" :disabled="busy === o.no" @click="act(o, 'accept')">接单</button>
              <button class="btn ghost sm" :disabled="busy === o.no" @click="act(o, 'reject')">拒单</button>
            </template>
            <template v-else-if="o.state === 'confirmed'">
              <button class="btn ghost sm" :disabled="busy === o.no" @click="act(o, 'finish')">标记完成</button>
            </template>
            <span v-else class="tag" :class="o.stateKind">{{ o.stateLabel }}</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p class="empty" v-if="!data.items.length">这个分类下还没有订单。</p>
  </template>
  <p class="hint">接单后房源自动置为「已出租」；拒单需填写原因，系统会释放房源并生成退款流水。</p>
  `,
};
