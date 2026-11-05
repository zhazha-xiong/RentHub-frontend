/**
 * 个人信息（v2 profile.html，narrow）
 */
import { ref, reactive, onMounted, useRouter } from '../lib.js';
import { api } from '../api.js';
import { state, setSession, toast } from '../store.js';

export default {
  name: 'ProfileView',
  setup() {
    const router = useRouter();
    const me = ref(null);
    const completeness = ref({ items: [], pct: 0 });
    const loading = ref(true);
    const saving = ref(false);
    const form = reactive({ nickname: '', oldPassword: '', newPassword: '' });

    async function load() {
      loading.value = true;
      try {
        const res = await api.profile();
        me.value = res.me;
        completeness.value = res.completeness;
        form.nickname = res.me.nickname;
      } catch (e) {
        toast(e.message || '加载失败', 'err');
        if (e.code === 'unauth') router.push({ path: '/login', query: { role: 'tenant', from: '/profile' } });
      } finally {
        loading.value = false;
      }
    }
    onMounted(load);

    async function save() {
      if (saving.value) return;
      saving.value = true;
      try {
        const res = await api.saveProfile({ ...form });
        me.value = res.me;
        completeness.value = res.completeness;
        setSession(res.me, state.counts);
        form.oldPassword = '';
        form.newPassword = '';
        toast('资料已保存', 'ok');
      } catch (e) {
        toast(e.message || '保存失败', 'err');
      } finally {
        saving.value = false;
      }
    }

    return { me, completeness, loading, saving, form, save };
  },
  template: `
  <h1>个人信息</h1>
  <div v-if="loading" class="page-loading">正在加载…</div>
  <div class="form" v-else-if="me">
    <div>
      <div class="fieldset">
        <h2>账号</h2>
        <div class="grid2">
          <div class="field"><label for="nick">昵称</label><input type="text" id="nick" v-model="form.nickname"></div>
          <div class="field"><label for="acct">账号</label><input type="text" id="acct" :value="me.account" disabled></div>
          <div class="field"><label for="phone2">手机号</label><input type="text" id="phone2" :value="me.phone || '未绑定'" disabled></div>
          <div class="field"><label for="reg">注册时间</label><input type="text" id="reg" :value="me.createdAt" disabled></div>
        </div>
      </div>
      <div class="fieldset">
        <h2>登录密码</h2>
        <div class="grid2">
          <div class="field"><label for="old">当前密码</label><input type="password" id="old" v-model="form.oldPassword" placeholder="修改密码时填写"></div>
          <div class="field"><label for="new">新密码</label><input type="password" id="new" v-model="form.newPassword" placeholder="8~20 位，含字母与数字"></div>
        </div>
        <p class="hint">修改后其它设备上的登录会自动失效。</p>
      </div>
    </div>
    <aside class="summary">
      <h2>资料完整度</h2>
      <div class="row" v-for="it in completeness.items" :key="it.label"><span>{{ it.label }}</span><b>{{ it.text }}</b></div>
      <div class="total"><span>完整度</span><b>{{ completeness.pct }}%</b></div>
      <button class="btn" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存修改' }}</button>
      <p class="fine">演示环境不校验真实身份信息。</p>
    </aside>
  </div>
  `,
};
