/**
 * 商家端 · 商家信息与资质（v2 merchant-profile.html）
 *
 * 「保存店铺信息」写回后端（PUT /api/merchant/profile）；
 * 表单改动同时防抖存草稿，刷新不丢。
 */
import { ref, reactive, watch, onMounted, useRouter } from '../../lib.js';
import { api } from '../../api.js';
import { useDraft, toast } from '../../store.js';

export default {
  name: 'MerchantProfile',
  setup() {
    const router = useRouter();
    const profile = ref(null);
    const stateText = ref('');
    const stateKind = ref('');
    const canList = ref(0);
    const loading = ref(true);
    const saving = ref(false);
    const form = reactive({ shopName: '', tel: '', intro: '' });
    const draft = useDraft('merchant:profile');

    async function load() {
      loading.value = true;
      try {
        const res = await api.merchantProfile();
        profile.value = res.profile;
        stateText.value = res.stateText;
        stateKind.value = res.stateKind;
        canList.value = res.canList;
        form.shopName = res.profile.shopName || '';
        form.tel = res.profile.tel || '';
        form.intro = res.profile.intro || '';
        const saved = await draft.load();
        if (saved) Object.assign(form, saved);
      } catch (e) {
        toast(e.message || '加载失败', 'err');
        if (e.code === 'unauth' || e.code === 'forbidden') router.push({ path: '/login', query: { role: 'merchant', from: '/merchant/profile' } });
      } finally {
        loading.value = false;
      }
    }
    onMounted(load);
    watch(form, () => { if (!loading.value) draft.save({ ...form }); }, { deep: true });

    async function save() {
      if (saving.value) return;
      saving.value = true;
      try {
        const res = await api.saveMerchantProfile({ ...form });
        profile.value = res.profile;
        await draft.clear();
        toast('店铺信息已保存', 'ok');
      } catch (e) {
        toast(e.message || '保存失败', 'err');
      } finally {
        saving.value = false;
      }
    }

    const resubmit = () => toast('演示环境：重新提交资质会生成一条待审核记录', 'ok');

    return { profile, stateText, stateKind, canList, loading, saving, form, save, resubmit };
  },
  template: `
  <h1>商家信息与资质</h1>
  <div v-if="loading" class="page-loading">正在加载…</div>
  <div class="form" v-else-if="profile">
    <div>
      <div class="fieldset">
        <h2>店铺信息</h2>
        <div class="grid2">
          <div class="field"><label for="shop">店铺名称</label><input type="text" id="shop" v-model="form.shopName"></div>
          <div class="field"><label for="tel">联系电话</label><input type="text" id="tel" v-model="form.tel"></div>
          <div class="field wide"><label for="intro">店铺简介</label><textarea id="intro" rows="3" v-model="form.intro"></textarea></div>
        </div>
      </div>

      <div class="fieldset">
        <h2>资质材料</h2>
        <p class="hint" style="margin:0 0 10px">营业执照 · 法人身份证 · 已上传 {{ profile.docs.length }} 张 · 支持 jpg/png，单张不超过 5MB</p>
        <div class="shots" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          <img v-for="(d, i) in profile.docs" :key="i" :src="d" alt="资质材料，演示图片"
            style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px">
          <div style="aspect-ratio:4/3;border:1px dashed var(--control);border-radius:6px;display:grid;place-items:center;color:var(--muted);font-size:13px">上传新材料</div>
        </div>
      </div>

      <div class="fieldset">
        <h2>审核记录</h2>
        <table class="table">
          <thead><tr><th>时间</th><th>动作</th><th>材料</th><th>结果</th></tr></thead>
          <tbody>
            <tr v-for="(h, i) in profile.history" :key="i">
              <td>{{ h.time }}</td><td>{{ h.action }}</td><td>{{ h.docs }}</td>
              <td><span class="tag" :class="h.kind === 'plain' ? 'plain' : h.kind">{{ h.result }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <aside class="summary">
      <h2>资质状态</h2>
      <p style="margin:0 0 12px"><span class="tag" :class="stateKind === 'ok' ? '' : stateKind">{{ stateText }}</span></p>
      <div class="row"><span>最近提交</span><b>{{ profile.submittedAt || '—' }}</b></div>
      <div class="row"><span>审核时间</span><b>{{ profile.reviewedAt || '—' }}</b></div>
      <div class="row"><span>审核人</span><b>管理员</b></div>
      <div class="row"><span>可上架房源</span><b>{{ canList }} 套</b></div>
      <button class="btn" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存店铺信息' }}</button>
      <button class="btn ghost" style="width:100%;margin-top:8px" @click="resubmit">重新提交资质</button>
      <p class="fine">资质通过后才能上架房源；更新材料后需重新审核，期间在架房源不受影响。</p>
    </aside>
  </div>
  `,
};
