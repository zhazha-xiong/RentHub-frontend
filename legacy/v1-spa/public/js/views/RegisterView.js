/**
 * 注册（v2 register.html，独立 URL /register）
 */
import { ref, watch } from '../lib.js';
import { register, toast, HOME_BY_ROLE } from '../store.js';
import { useRouter } from '../lib.js';

export default {
  name: 'RegisterView',
  setup() {
    const router = useRouter();
    const role = ref('tenant');
    const account = ref('');
    const password = ref('');
    const confirm = ref('');
    const submitting = ref(false);
    const error = ref('');

    function pickRole(r) { role.value = r; }

    async function submit() {
      if (submitting.value) return;
      submitting.value = true;
      error.value = '';
      try {
        const res = await register({ role: role.value, account: account.value, password: password.value, confirm: confirm.value });
        toast('注册成功，已自动登录', 'ok');
        router.replace(res.redirect || HOME_BY_ROLE[res.me.role] || '/');
      } catch (e) {
        error.value = e.message || '注册失败';
      } finally {
        submitting.value = false;
      }
    }

    return { role, account, password, confirm, submitting, error, pickRole, submit };
  },
  template: `
  <h1>注册</h1>

  <div class="role-switch two" role="tablist" aria-label="注册身份">
    <button role="tab" :class="{ on: role === 'tenant' }" :aria-selected="role === 'tenant' ? 'true' : 'false'" @click="pickRole('tenant')">租客</button>
    <button role="tab" :class="{ on: role === 'merchant' }" :aria-selected="role === 'merchant' ? 'true' : 'false'" @click="pickRole('merchant')">商家</button>
  </div>

  <div class="alert" v-if="error">{{ error }}</div>

  <form class="auth-fields" @submit.prevent="submit">
    <div class="field"><label for="acct2">账号</label>
      <input type="text" id="acct2" placeholder="4~20 位字母或数字" v-model="account"></div>
    <div class="field"><label for="pwd2">密码</label>
      <input type="password" id="pwd2" placeholder="8~20 位，含字母与数字" v-model="password"></div>
    <div class="field"><label for="pwd3">确认密码</label>
      <input type="password" id="pwd3" placeholder="再输入一次" v-model="confirm"></div>
    <button class="btn auth-btn" type="submit" :disabled="submitting">{{ submitting ? '注册中…' : '注册并进入' }}</button>
  </form>

  <p class="auth-alt">已有账号？<RouterLink to="/login">去登录</RouterLink></p>
  <p class="hint">昵称由系统随机生成，注册后可在「个人信息」里修改；注册商家后需要先提交资质，通过后才能上架房源。</p>
  `,
};
