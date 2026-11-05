/**
 * 确认订单（v2 booking.html，页面宽度 narrow）
 *
 * 两张卡：左边租约表单、右边金额明细。
 * 「填写的内容不丢」：表单每次变动都防抖写回后端草稿（/api/drafts/booking:<id>），
 * 刷新、切走再回来、甚至换浏览器都还在；下单成功后草稿自动清空。
 */
import { ref, reactive, computed, watch, onMounted, useRoute, useRouter } from '../lib.js';
import { api } from '../api.js';
import { state, setCounts, useDraft, toast } from '../store.js';

export default {
  name: 'BookingView',
  setup() {
    const route = useRoute();
    const router = useRouter();

    const house = ref(null);
    const loading = ref(true);
    const submitting = ref(false);
    const form = reactive({ months: '12', checkIn: '', guests: '2', phone: '', note: '' });
    const draft = useDraft(`booking:${route.params.id}`);

    const rent = computed(() => house.value?.pricing.rent || 0);
    const deposit = computed(() => house.value?.pricing.deposit || 0);
    const serviceFee = computed(() => house.value?.pricing.serviceFee || 0);
    const months = computed(() => Number(form.months) || 1);
    const rentTotal = computed(() => rent.value * months.value);
    const total = computed(() => rentTotal.value + deposit.value + serviceFee.value);

    async function load() {
      loading.value = true;
      try {
        const res = await api.house(route.params.id);
        house.value = res.house;
        form.checkIn = res.house.availability.availableFrom || '';
        form.phone = state.me?.phone || '';
        /* 草稿优先：刷新后把上次填的内容还原 */
        const saved = await draft.load();
        if (saved) Object.assign(form, saved);
      } catch (e) {
        toast(e.message || '房源加载失败', 'err');
      } finally {
        loading.value = false;
      }
    }
    onMounted(load);
    watch(form, () => {
      if (!loading.value) draft.save({ ...form });
    }, { deep: true });

    async function pay() {
      if (submitting.value) return;
      submitting.value = true;
      try {
        const res = await api.createOrder({
          houseId: house.value.id,
          months: months.value,
          checkIn: form.checkIn,
          guests: Number(form.guests) || 1,
          phone: form.phone,
          note: form.note,
        });
        if (res.counts) setCounts(res.counts);
        await draft.clear();
        toast(`订单 ${res.order.no} 已提交，等待商家确认`, 'ok');
        router.push('/orders');
      } catch (e) {
        toast(e.message || '下单失败', 'err');
        if (e.code === 'unauth') router.push({ path: '/login', query: { role: 'tenant', from: route.fullPath } });
      } finally {
        submitting.value = false;
      }
    }

    return { house, loading, submitting, form, rent, deposit, serviceFee, months, rentTotal, total, pay };
  },
  template: `
  <div v-if="loading" class="page-loading">正在加载…</div>
  <template v-else-if="house">
    <p class="crumbs"><RouterLink to="/">找房</RouterLink><span>/</span><RouterLink :to="'/house/' + house.id">{{ house.title }}</RouterLink><span>/</span>确认订单</p>
    <h1>确认订单</h1>

    <div class="form">
      <div>
        <div class="fieldset">
          <h2>房源</h2>
          <div class="order">
            <div class="body">
              <img :src="house.images[0].src" alt="">
              <div>
                <p class="t">{{ house.title }}</p>
                <p class="m">{{ house.meta }}</p>
                <p class="m">商家：{{ house.merchant.name }} · 资质已认证</p>
              </div>
              <div class="amt"><b>{{ fmt(house.pricing.rent) }}</b> 元/月<p>押金 {{ fmt(house.pricing.deposit) }} 元</p></div>
            </div>
          </div>
        </div>

        <div class="fieldset">
          <h2>租约信息</h2>
          <div class="grid2">
            <div class="field"><label for="months">租期</label>
              <select id="months" v-model="form.months">
                <option value="3">3 个月</option><option value="6">6 个月</option>
                <option value="12">12 个月</option><option value="24">24 个月</option>
              </select>
            </div>
            <div class="field"><label for="date">入住日期</label><input type="date" id="date" v-model="form.checkIn"></div>
            <div class="field"><label for="guests">入住人数</label><input type="number" id="guests" min="1" max="8" v-model="form.guests"></div>
            <div class="field"><label for="phone">联系方式</label><input type="text" id="phone" v-model="form.phone"></div>
            <div class="field wide"><label for="note">备注（选填）</label><textarea id="note" rows="3" placeholder="例如：希望能留一个书桌位，周末看房" v-model="form.note"></textarea></div>
          </div>
        </div>

        <p class="hint">订单提交后房源会锁定，商家在 24 小时内确认；未确认前你可以随时取消，款项原路退回。</p>
      </div>

      <aside class="summary">
        <h2>金额明细</h2>
        <div class="row"><span>月租 {{ fmt(rent) }} × {{ months }} 个月</span><b>{{ fmt(rentTotal) }}</b></div>
        <div class="row"><span>押金</span><b>{{ fmt(deposit) }}</b></div>
        <div class="row"><span>服务费（月租 5%）</span><b>{{ fmt(serviceFee) }}</b></div>
        <div class="total"><span>应付总额</span><b>{{ fmt(total) }}</b></div>
        <button class="btn" :disabled="submitting" @click="pay">{{ submitting ? '提交中…' : '模拟支付' }}</button>
        <p class="fine">演示环境不接真实支付，点击即视为支付成功并生成支付流水。</p>
      </aside>
    </div>
  </template>
  `,
};
