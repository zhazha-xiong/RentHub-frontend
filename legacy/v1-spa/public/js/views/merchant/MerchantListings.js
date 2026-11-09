/**
 * 商家端 · 房源管理（v2 merchant-listings.html，独立 URL /merchant/listings）
 */
import { ref, computed, watch, useRoute, useRouter } from '../../lib.js';
import { api } from '../../api.js';
import { state, toast } from '../../store.js';

const STATUS = ['全部状态', '在架', '已出租', '已下架'];

export default {
  name: 'MerchantListings',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const data = ref({ items: [], note: '', canCreate: true });
    const loading = ref(true);
    const busy = ref('');

    const kw = ref(route.query.q || '');
    const status = ref(route.query.status || '全部状态');

    async function load() {
      loading.value = true;
      try {
        const res = await api.merchantHouses({ q: route.query.q || '', status: route.query.status || '全部状态' });
        data.value = res;
        state.merchantHouses = res.items.length;
      } catch (e) {
        toast(e.message || '加载失败', 'err');
        if (e.code === 'unauth' || e.code === 'forbidden') router.push({ path: '/login', query: { role: 'merchant', from: route.fullPath } });
      } finally {
        loading.value = false;
      }
    }
    watch(() => route.fullPath, load, { immediate: true });

    function applyFilter() {
      const query = {};
      if (kw.value) query.q = kw.value;
      if (status.value && status.value !== '全部状态') query.status = status.value;
      router.replace({ path: '/merchant/listings', query });
    }

    async function toggle(row) {
      if (row.state === '已出租') { router.push('/merchant/orders'); return; }
      busy.value = row.id;
      try {
        const res = await api.toggleHouseStatus(row.id);
        toast(`已${res.status === '在架' ? '上架' : '下架'}：${row.title}`, 'ok');
        await load();
      } catch (e) {
        toast(e.message || '操作失败', 'err');
      } finally {
        busy.value = '';
      }
    }

    function edit(row) {
      if (row.state === '已出租') { toast('房源处于「已出租」时不能编辑', 'warn'); return; }
      router.push(`/merchant/houses/${row.id}/edit`);
    }

    const create = () => router.push('/merchant/houses/new/edit');
    const viewOrders = () => router.push('/merchant/orders');

    return { data, loading, busy, kw, status, STATUS, applyFilter, toggle, edit, create, viewOrders };
  },
  template: `
  <div class="head">
    <div><h1>房源管理</h1></div>
    <div class="right"><button class="btn" @click="create">新建房源</button></div>
  </div>

  <div class="toolbar">
    <input type="search" placeholder="搜索房源标题或小区" aria-label="搜索房源" v-model="kw" @keyup.enter="applyFilter" @change="applyFilter">
    <select class="select-sm" aria-label="状态筛选" v-model="status" @change="applyFilter">
      <option v-for="s in STATUS" :key="s" :value="s">{{ s }}</option>
    </select>
    <span class="grow"></span>
    <span class="note">{{ loading ? '正在加载…' : data.note }}</span>
  </div>

  <table class="table">
    <thead><tr><th>房源</th><th>状态</th><th class="num">租金</th><th class="num">浏览</th><th class="num">收藏</th><th>更新</th><th>操作</th></tr></thead>
    <tbody>
      <tr v-for="r in data.items" :key="r.id">
        <td><div class="t"><img :src="r.img" alt=""><div><p>{{ r.title }}</p><p class="m">{{ r.meta }}</p></div></div></td>
        <td><span class="tag" :class="r.stateKind">{{ r.state }}</span></td>
        <td class="num">{{ r.rent }} 元/月</td>
        <td class="num">{{ r.views }}</td>
        <td class="num">{{ r.fav }}</td>
        <td>{{ r.time }}</td>
        <td>
          <template v-if="r.state === '已出租'">
            <button class="btn ghost sm" @click="viewOrders">查看订单</button>
          </template>
          <template v-else>
            <button class="btn ghost sm" @click="edit(r)">编辑</button>
            <button class="btn ghost sm" :disabled="busy === r.id" @click="toggle(r)">{{ r.action }}</button>
          </template>
        </td>
      </tr>
    </tbody>
  </table>
  <p class="empty" v-if="!loading && !data.items.length">没有符合条件的房源。</p>
  <p class="hint">房源处于「已出租」时不能改价，也不允许删除；只有下架状态可以编辑全部字段。</p>
  `,
};
