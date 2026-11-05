/**
 * 管理员端 · 资质审核（v2 admin-review.html，独立 URL /admin/review）
 *
 * 选中哪一条写进 URL（?id=rv-1），刷新后仍停在同一份材料上；
 * 「驳回原因」也存后端草稿，不会被刷新清掉。
 */
import { ref, watch, computed, useRoute, useRouter } from '../../lib.js';
import { api } from '../../api.js';
import { state, useDraft, toast } from '../../store.js';

const STATE_TAG = {
  pending: { text: '待审核', cls: 'warn' },
  approved: { text: '已通过', cls: '' },
  rejected: { text: '已驳回', cls: 'plain' },
};

export default {
  name: 'AdminReview',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const data = ref({ items: [], tabs: [], activeId: null });
    const loading = ref(true);
    const saving = ref(false);
    const reason = ref('');
    const draft = useDraft('admin:reject-reason');

    const activeId = computed(() => route.query.id || data.value.activeId);
    const active = computed(() => data.value.items.find((r) => r.id === activeId.value) || data.value.items[0] || null);
    const tab = computed(() => route.query.state || 'all');

    async function load() {
      loading.value = true;
      try {
        const res = await api.adminReviews({ state: tab.value, id: route.query.id || '' });
        data.value = res;
        const pending = (res.tabs.find((t) => t.key === 'pending') || {}).n || 0;
        state.adminPending = pending;
        const saved = await draft.load();
        reason.value = (saved && saved[active.value?.id]) || '';
      } catch (e) {
        toast(e.message || '加载失败', 'err');
        if (e.code === 'unauth' || e.code === 'forbidden') router.push({ path: '/login', query: { role: 'admin', from: route.fullPath } });
      } finally {
        loading.value = false;
      }
    }
    watch(() => route.fullPath, load, { immediate: true });
    watch(reason, (v) => {
      if (loading.value) return;
      const cur = { [active.value?.id || 'x']: v };
      draft.save(cur);
    });

    function select(r) {
      router.replace({ path: '/admin/review', query: { ...(tab.value !== 'all' ? { state: tab.value } : {}), id: r.id } });
    }
    function setTab(key) {
      router.replace({ path: '/admin/review', query: key === 'all' ? {} : { state: key } });
    }

    async function decide(action) {
      if (saving.value || !active.value) return;
      saving.value = true;
      try {
        await api.adminReview(active.value.id, action, { reason: reason.value });
        toast(action === 'approve' ? `已通过「${active.value.name}」的资质` : `已驳回「${active.value.name}」`, 'ok');
        reason.value = '';
        await load();
      } catch (e) {
        toast(e.message || '操作失败', 'err');
      } finally {
        saving.value = false;
      }
    }

    return { data, loading, saving, reason, active, activeId, tab, select, setTab, decide, STATE_TAG };
  },
  template: `
  <h1>资质审核</h1>

  <div v-if="loading" class="page-loading">正在加载审核单…</div>
  <div class="split" v-else>
    <div>
      <table class="table">
        <thead><tr><th>商家</th><th>提交时间</th><th>材料</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="r in data.items" :key="r.id" @click="select(r)"
            :aria-current="active && active.id === r.id ? 'true' : null"
            :style="active && active.id === r.id ? 'background:#fafaf9;cursor:pointer' : 'cursor:pointer'">
            <td><p>{{ r.name }}</p><p class="m">{{ r.district }} · {{ r.listings }} 套在架申请</p></td>
            <td>{{ r.submittedAt }}</td>
            <td>{{ r.docs }} 张</td>
            <td><span class="tag" :class="STATE_TAG[r.state].cls">{{ STATE_TAG[r.state].text }}</span></td>
          </tr>
        </tbody>
      </table>
      <p class="empty" v-if="!data.items.length">没有符合条件的申请。</p>
    </div>

    <aside class="review-panel" v-if="active">
      <h2>{{ active.name }}</h2>
      <p class="muted-line">{{ active.detail }}</p>
      <div class="shots"><img v-for="(s, i) in active.shots" :key="i" :src="s" alt="资质材料，演示图片"></div>
      <div class="field"><label for="reason">驳回原因（通过时可不填）</label>
        <textarea id="reason" rows="3" placeholder="不少于 10 字，说明需要补正的材料" v-model="reason"></textarea></div>
      <div class="actions" style="display:flex;gap:8px;margin-top:12px">
        <button class="btn" style="flex:1" :disabled="saving || active.state !== 'pending'" @click="decide('approve')">通过并解锁上架</button>
        <button class="btn ghost" style="flex:1" :disabled="saving || active.state !== 'pending'" @click="decide('reject')">驳回</button>
      </div>
      <p class="hint">{{ active.state === 'pending' ? '通过后商家立即可以上架房源，并会收到一条站内通知。' : ('该申请已处理：' + STATE_TAG[active.state].text + (active.reason ? '（' + active.reason + '）' : '')) }}</p>
    </aside>
  </div>
  `,
};
