/**
 * 登录（v2 login.html，独立 URL /login）
 *
 * 三个入口 tab（租客 / 商家 / 管理员）真实对应后端的角色校验：
 *   - 密码错 → 后台累计失败次数，5 次锁定 15 分钟
 *   - 角色不符 → 提示从哪个入口登录
 * 登录成功后写 httpOnly cookie，前端拿不到、也改不了。
 */
import { ref, computed, onMounted, watch, useRoute, useRouter } from '../lib.js';
import { state, login, toast, HOME_BY_ROLE, ROLE_LABEL } from '../store.js';

const ROLES = [
  { key: 'tenant', label: '租客' },
  { key: 'merchant', label: '商家' },
  { key: 'admin', label: '管理员' },
];

/** 原型演示的异常态文案（与原 app.js applyLoginState 完全一致） */
const DEMO_STATES = {
  badpwd: { cls: '', text: '账号或密码不正确。你还可以再试 4 次，超过 5 次该账号会被锁定 15 分钟。' },
  wrongrole: { cls: 'warn', text: '该账号是商家账号，请从上方「商家」入口登录。' },
  locked: { cls: '', text: '连续 5 次密码错误，账号已锁定 15 分钟。14:32 之后可重试，或联系管理员解锁。' },
};

export default {
  name: 'LoginView',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const role = ref(ROLES.some((r) => r.key === route.query.role) ? route.query.role : 'tenant');
    const account = ref('');
    const password = ref('');
    const remember = ref(false);
    const alert = ref(null);
    const submitting = ref(false);
    const locked = ref(false);

    const from = computed(() => (typeof route.query.from === 'string' && route.query.from.startsWith('/') ? route.query.from : ''));

    watch(role, (r) => router.replace({ path: '/login', query: { ...route.query, role: r } }));

    onMounted(() => {
      if (state.me) {
        alert.value = { cls: 'warn', text: `当前已登录为「${state.me.nickname}」（${ROLE_LABEL[state.me.role]}），可直接切换入口重新登录。` };
      }
    });

    function pickRole(r) { role.value = r; }

    function showDemo(kind) {
      const d = DEMO_STATES[kind];
      if (!d) return;
      if (kind === 'wrongrole') role.value = 'merchant';
      if (kind === 'locked') { locked.value = true; }
      alert.value = { cls: d.cls, text: d.text };
    }

    async function submit() {
      if (submitting.value || locked.value) return;
      submitting.value = true;
      alert.value = null;
      try {
        const res = await login({ role: role.value, account: account.value, password: password.value });
        toast(`欢迎回来，${res.me.nickname}`, 'ok');
        const target = from.value || res.redirect || HOME_BY_ROLE[res.me.role] || '/';
        router.replace(target);
      } catch (e) {
        alert.value = { cls: e.code === 'wrongrole' ? 'warn' : '', text: e.message || '登录失败' };
        if (e.code === 'locked') locked.value = true;
        if (e.payload?.actualRole) role.value = e.payload.actualRole;
      } finally {
        submitting.value = false;
      }
    }

    return { ROLES, role, account, password, remember, alert, submitting, locked, pickRole, showDemo, submit, state };
  },
  template: `
  <h1>登录</h1>

  <div class="role-switch" role="tablist" aria-label="登录入口">
    <button v-for="r in ROLES" :key="r.key" role="tab"
      :class="{ on: role === r.key }" :aria-selected="role === r.key ? 'true' : 'false'"
      @click="pickRole(r.key)">{{ r.label }}</button>
  </div>

  <div class="alert" :class="alert ? alert.cls : ''" v-if="alert">{{ alert.text }}</div>

  <form class="auth-fields" @submit.prevent="submit">
    <div class="field"><label for="acct">账号</label>
      <input type="text" id="acct" placeholder="4~20 位字母或数字" autocomplete="username" v-model="account" :disabled="locked"></div>
    <div class="field"><label for="pwd">密码</label>
      <input type="password" id="pwd" placeholder="8~20 位，含字母与数字" autocomplete="current-password" v-model="password" :disabled="locked"></div>
    <div class="auth-row">
      <label class="check"><input type="checkbox" v-model="remember"> 7 天内记住我</label>
      <a href="#" @click.prevent>忘记密码？</a>
    </div>
    <button class="btn auth-btn" type="submit" :disabled="submitting || locked">{{ locked ? '已锁定，稍后再试' : (submitting ? '登录中…' : '登录') }}</button>
  </form>

  <p class="auth-alt">还没有账号？<RouterLink to="/register">立即注册</RouterLink></p>
  <p class="demo-states">原型演示：<a href="#" @click.prevent="showDemo('badpwd')">密码错误</a><span>·</span><a href="#" @click.prevent="showDemo('wrongrole')">入口不符</a><span>·</span><a href="#" @click.prevent="showDemo('locked')">账号锁定</a></p>
  `,
};
