/**
 * 商家端 · 编辑房源（v2 merchant-edit.html）
 *
 * 表单内容写回后端：改动即防抖存草稿（/api/drafts/merchant:edit:<id>），
 * 「保存并上架」才真正提交到 /api/merchant/houses/:id 并落盘。
 */
import { ref, reactive, computed, watch, onMounted, useRoute, useRouter } from '../../lib.js';
import { api } from '../../api.js';
import { state, useDraft, toast } from '../../store.js';

export default {
  name: 'MerchantEdit',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const id = computed(() => route.params.id);

    const house = ref(null);
    const valuation = ref(null);
    const isNew = ref(false);
    const loading = ref(true);
    const saving = ref(false);
    const form = reactive({
      title: '', type: '', rentType: '', desc: '',
      district: '', community: '', address: '', metro: '', walk: '',
      room: '', area: '', floor: '', orient: '', decor: '', elevator: false,
      bedroom: [], publicFac: [],
      rent: '', deposit: '', avail: '', minMonths: '6', pay: '', view: '', park: '',
    });
    const draft = useDraft(`merchant:edit:${id.value}`);

    const facDict = computed(() => state.meta?.filters?.facilities || { bedroom: [], public: [] });
    const houseTypes = computed(() => state.meta?.filters?.houseTypes || ['普通住宅', '公寓']);
    const rentTypes = computed(() => state.meta?.filters?.rentTypes || ['整租', '合租/单间']);
    const districts = computed(() => (state.meta?.filters?.districts || []).filter((d) => d !== '全部'));
    const orients = computed(() => state.meta?.filters?.orients || []);
    const decors = computed(() => state.meta?.filters?.decors || []);

    function fillFrom(h) {
      form.title = h.title;
      form.type = h.spec.type;
      form.rentType = h.spec.rentType;
      form.desc = h.description.text;
      form.district = h.place.district;
      form.community = h.place.area;
      form.address = h.place.address;
      form.metro = h.place.metro.line;
      form.walk = String(h.place.metro.walkM || '');
      form.room = `${h.spec.rooms} / ${h.spec.halls} / ${h.spec.baths}`;
      form.area = String(h.spec.area);
      form.floor = `${h.spec.floor} / ${h.spec.totalFloor}`;
      form.orient = h.spec.orient;
      form.decor = h.spec.decor;
      form.elevator = h.spec.elevator;
      form.bedroom = h.facilities.bedroom.map((x) => x.label);
      form.publicFac = h.facilities.public.map((x) => x.label);
      form.rent = String(h.pricing.rent);
      form.deposit = String(h.pricing.deposit);
      form.avail = h.availability.availableFrom || '';
      form.minMonths = String(h.availability.minMonths || 6);
      form.pay = h.pricing.payMethod;
      form.view = h.availability.viewing;
      form.park = h.availability.parking || '';
    }

    async function load() {
      loading.value = true;
      try {
        const res = await api.merchantHouse(id.value);
        house.value = res.house;
        valuation.value = res.valuation;
        isNew.value = Boolean(res.isNew);
        fillFrom(res.house);
        const saved = await draft.load();
        if (saved) Object.assign(form, saved);
      } catch (e) {
        toast(e.message || '房源加载失败', 'err');
        if (e.code === 'unauth' || e.code === 'forbidden') router.push({ path: '/login', query: { role: 'merchant', from: route.fullPath } });
      } finally {
        loading.value = false;
      }
    }
    onMounted(load);
    watch(form, () => { if (!loading.value) draft.save({ ...form }); }, { deep: true });

    function toggleIn(list, label, on) {
      const set = new Set(list);
      if (on) set.add(label); else set.delete(label);
      return [...set];
    }

    function payload() {
      return {
        title: form.title, desc: form.desc, type: form.type, rentType: form.rentType,
        district: form.district, community: form.community, address: form.address,
        metro: form.metro, walk: form.walk, room: form.room, area: form.area, floor: form.floor,
        orient: form.orient, decor: form.decor, elevator: form.elevator,
        bedroom: form.bedroom, publicFac: form.publicFac,
        rent: form.rent, deposit: form.deposit, avail: form.avail, minMonths: form.minMonths,
        pay: form.pay, view: form.view, park: form.park,
      };
    }

    async function saveDraftOnly() {
      await draft.save({ ...form });
      toast('草稿已保存到服务器', 'ok');
    }

    async function saveAll() {
      if (saving.value) return;
      saving.value = true;
      try {
        const res = isNew.value
          ? await api.createHouse(payload())
          : await api.saveHouse(id.value, payload());
        house.value = res.house;
        fillFrom(res.house);
        await draft.clear();
        toast(isNew.value ? '房源已创建并上架' : '已保存并同步到房源列表', 'ok');
        router.push('/merchant/listings');
      } catch (e) {
        toast(e.message || '保存失败', 'err');
      } finally {
        saving.value = false;
      }
    }

    return {
      house, valuation, isNew, loading, saving, form, facDict,
      houseTypes, rentTypes, districts, orients, decors, toggleIn, saveDraftOnly, saveAll,
    };
  },
  template: `
  <p class="crumbs"><RouterLink to="/merchant/listings">房源管理</RouterLink><span>/</span>{{ isNew ? '新建房源' : '编辑房源' }}</p>
  <div v-if="loading" class="page-loading">正在加载房源…</div>
  <template v-else-if="house">
    <div class="head">
      <div><h1>{{ isNew ? '新建房源' : '编辑房源' }}</h1></div>
      <div class="right">
        <button class="btn ghost" @click="saveDraftOnly">保存草稿</button>
        <button class="btn" :disabled="saving" @click="saveAll">{{ saving ? '保存中…' : (isNew ? '保存并上架' : '保存并上架') }}</button>
      </div>
    </div>

    <div class="form">
      <div>
        <div class="fieldset">
          <h2>基本信息</h2>
          <div class="grid2">
            <div class="field wide"><label for="title">标题</label><input type="text" id="title" v-model="form.title"></div>
            <div class="field"><label for="htype">房屋类型</label>
              <select id="htype" v-model="form.type"><option v-for="t in houseTypes" :key="t" :value="t">{{ t }}</option></select></div>
            <div class="field"><label for="rtype">租赁类型</label>
              <select id="rtype" v-model="form.rentType"><option v-for="t in rentTypes" :key="t" :value="t">{{ t }}</option></select></div>
            <div class="field wide"><label for="desc">房源描述</label><textarea id="desc" rows="3" v-model="form.desc"></textarea></div>
          </div>
        </div>

        <div class="fieldset">
          <h2>位置</h2>
          <div class="grid2">
            <div class="field"><label for="region">区域</label>
              <select id="region" v-model="form.district"><option v-for="d in districts" :key="d" :value="d">{{ d }}</option></select></div>
            <div class="field"><label for="comm">小区（选填）</label><input type="text" id="comm" v-model="form.community"></div>
            <div class="field wide"><label for="addr">详细地址</label><input type="text" id="addr" v-model="form.address"></div>
            <div class="field"><label for="metro">地铁线路</label>
              <select id="metro" v-model="form.metro">
                <option value="1 号线">1 号线</option><option value="2 号线">2 号线</option>
                <option value="3 号线">3 号线</option><option value="5 号线">5 号线</option>
                <option value="12 号线">12 号线</option><option value="不近地铁">不近地铁</option>
              </select></div>
            <div class="field"><label for="walk">步行距离</label>
              <div class="with-unit"><input type="text" id="walk" v-model="form.walk"><span class="unit">米</span></div></div>
          </div>
        </div>

        <div class="fieldset">
          <h2>户型与配套</h2>
          <div class="grid2">
            <div class="field"><label for="room">室 / 厅 / 卫</label><input type="text" id="room" v-model="form.room"></div>
            <div class="field"><label for="area">面积</label>
              <div class="with-unit"><input type="text" id="area" v-model="form.area"><span class="unit">㎡</span></div></div>
            <div class="field"><label for="floor">楼层 / 总层</label><input type="text" id="floor" v-model="form.floor"></div>
            <div class="field"><label for="ori">朝向</label>
              <select id="ori" v-model="form.orient"><option v-for="o in orients" :key="o" :value="o">{{ o }}</option></select></div>
            <div class="field"><label for="dec">装修</label>
              <select id="dec" v-model="form.decor"><option v-for="d in decors" :key="d" :value="d">{{ d }}</option></select></div>
            <div class="field"><label>&nbsp;</label>
              <label class="check"><input type="checkbox" v-model="form.elevator"> 有电梯</label></div>
          </div>
          <div class="facrow">
            <span class="faclabel">卧室设施</span>
            <div class="chkrow">
              <label class="check" v-for="f in facDict.bedroom" :key="f.label">
                <input type="checkbox" :checked="form.bedroom.includes(f.label)" @change="form.bedroom = toggleIn(form.bedroom, f.label, $event.target.checked)"> {{ f.label }}
              </label>
            </div>
          </div>
          <div class="facrow">
            <span class="faclabel">公共设施</span>
            <div class="chkrow">
              <label class="check" v-for="f in facDict.public" :key="f.label">
                <input type="checkbox" :checked="form.publicFac.includes(f.label)" @change="form.publicFac = toggleIn(form.publicFac, f.label, $event.target.checked)"> {{ f.label }}
              </label>
            </div>
          </div>
        </div>

        <div class="fieldset">
          <h2>租金与租约</h2>
          <div class="grid2">
            <div class="field"><label for="rent">月租</label>
              <div class="with-unit"><input type="text" id="rent" v-model="form.rent"><span class="unit">元/月</span></div></div>
            <div class="field"><label for="dep">押金</label>
              <div class="with-unit"><input type="text" id="dep" v-model="form.deposit"><span class="unit">元</span></div></div>
            <div class="field"><label for="avail">可入住日期</label><input type="date" id="avail" v-model="form.avail"></div>
            <div class="field"><label for="min">最短租期</label>
              <select id="min" v-model="form.minMonths"><option value="6">6 个月</option><option value="12">12 个月</option></select></div>
            <div class="field"><label for="pay">付款方式</label>
              <select id="pay" v-model="form.pay"><option>押一付三</option><option>押一付一</option><option>押一付六</option><option>年付</option></select></div>
            <div class="field"><label for="view">看房方式</label>
              <select id="view" v-model="form.view"><option>随时可看</option><option>预约看房</option><option>仅周末</option></select></div>
            <div class="field wide"><label for="park">车位（选填）</label><input type="text" id="park" v-model="form.park"></div>
          </div>
        </div>

        <div class="fieldset">
          <h2>图片</h2>
          <p class="hint" style="margin:0 0 8px">已上传 {{ house.images.length }} 张 · 首图为封面 · 单张不超过 5MB</p>
          <div class="shots" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
            <img v-for="(img, i) in house.images.slice(0, 3)" :key="i" :src="img.src" alt=""
              style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px">
            <div style="aspect-ratio:4/3;border:1px dashed var(--control);border-radius:6px;display:grid;place-items:center;color:var(--muted);font-size:13px">上传图片</div>
          </div>
        </div>
      </div>

      <aside class="drawer" v-if="valuation">
        <div class="dh"><b>AI 辅助</b><span class="close">收起</span></div>
        <div class="dbody">
          <p style="margin:0;font-size:12px;color:var(--muted)">参考价 · {{ valuation.scope }}</p>
          <p class="range-big">{{ valuation.range }}</p>
          <p class="range-note">样本 {{ valuation.samples }} 套 · 中位数 {{ valuation.median }} 元 · 你的定价 {{ valuation.rent }} 元{{ valuation.inRange ? '处于区间内' : '不在区间内' }}</p>

          <div style="margin-top:14px">
            <div class="peer" v-for="p in valuation.peers" :key="p.label"><span>{{ p.label }}</span><b>{{ p.price }}</b></div>
          </div>

          <p class="why">{{ valuation.why }}</p>
          <div class="actions">
            <button class="btn" @click="form.rent = String(house.pricing.rent)">填入 {{ valuation.rent }}</button>
            <button class="btn ghost">忽略</button>
          </div>

          <hr style="border:0;border-top:1px solid var(--rule);margin:16px 0">
          <p style="margin:0 0 8px;font-size:12px;color:var(--muted)">文案候选（标题）</p>
          <div class="peer"><span>{{ valuation.candidates[0] }}</span><b>选用</b></div>
          <div class="peer"><span>{{ valuation.candidates[1] }}</span><span>备用</span></div>
          <p class="why">候选文案只引用了已填字段；未填写的「学区」「宠物」不会被写入。</p>
        </div>
      </aside>
    </div>
  </template>
  `,
};
