/**
 * 找房列表（v2 index.html）
 *
 * 排版与原页面完全一致；区别只有两处「数据来源」与「状态位置」：
 *   1. 卡片 / 筛选项 / 统计数字全部来自 /api/houses 与 /api/meta；
 *   2. 所有筛选条件都写进 URL query —— 刷新、后退、把链接发给别人，结果都一样。
 */
import { ref, reactive, computed, watch, useRoute, useRouter } from '../lib.js';
import { api } from '../api.js';
import { state, toast } from '../store.js';
import HouseCard from '../components/HouseCard.js';

/** 租金档位 = 一句按钮文案 + 一个区间（后端按 rentMin/rentMax 过滤） */
const RENT_BANDS = [
  { key: 'lt500', label: '500 元以下', min: 0, max: 500 },
  { key: '500-800', label: '500–800 元', min: 500, max: 800 },
  { key: '800-1000', label: '800–1000 元', min: 800, max: 1000 },
  { key: '1000-1500', label: '1000–1500 元', min: 1000, max: 1500 },
  { key: '1500-2000', label: '1500–2000 元', min: 1500, max: 2000 },
  { key: '2000-3000', label: '2000–3000 元', min: 2000, max: 3000 },
  { key: '3000-5000', label: '3000–5000 元', min: 3000, max: 5000 },
  { key: 'gt5000', label: '5000 元以上', min: 5000, max: 0 },
];

const ROOM_OPTS = [
  { label: '一室', value: '1' }, { label: '二室', value: '2' }, { label: '三室', value: '3' },
  { label: '四室', value: '4' }, { label: '五室及以上', value: '5' },
];

const SORTS = [
  { key: 'default', label: '综合' }, { key: 'newest', label: '最新' },
  { key: 'price_asc', label: '价格 ↑' }, { key: 'price_desc', label: '价格 ↓' },
];

export default {
  name: 'HomeView',
  components: { HouseCard },
  setup() {
    const route = useRoute();
    const router = useRouter();

    const data = ref({ items: [], total: 0, summary: null });
    const loading = ref(true);
    const mode = ref(route.query.metro ? 'metro' : 'region');
    const keyword = ref(route.query.q || '');
    const custom = reactive({ min: route.query.rentMin || '', max: route.query.rentMax || '' });

    const filters = computed(() => state.meta?.filters || {
      districts: ['全部'], metros: [], rentTypes: [], houseTypes: [], orients: [],
    });

    const cur = (k) => (route.query[k] === undefined ? '' : String(route.query[k]));
    const isAll = (k) => !route.query[k];
    const setOn = (k, v) => cur(k) === String(v);

    /** 只改 URL，不直接改数据 —— 请求由 watch(route.fullPath) 统一触发 */
    function setQuery(patch) {
      const next = { ...route.query };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '' || v === '全部') delete next[k];
        else next[k] = String(v);
      }
      router.replace({ path: route.path, query: next });
    }

    function pickDistrict(v) { setQuery({ district: v === '全部' ? '' : v }); mode.value = 'region'; }
    function pickMetro(v) { setQuery({ metro: v === '全部' ? '' : v }); }
    function pickRent(key) { setQuery({ rent: key, rentMin: '', rentMax: '' }); custom.min = ''; custom.max = ''; }
    function applyCustomRent() {
      const min = String(custom.min || '').trim();
      const max = String(custom.max || '').trim();
      setQuery({ rent: '', rentMin: min, rentMax: max });
    }
    function pickRooms(v) { setQuery({ rooms: v === '全部' ? '' : v }); }
    function pickRentType(v) { setQuery({ rentType: v === '全部' ? '' : v }); }
    function pickSort(k) { setQuery({ sort: k === 'default' ? '' : k }); }
    function toggleElevator(e) { setQuery({ elevator: e.target.checked ? '1' : '' }); }
    function submitSearch() { setQuery({ q: keyword.value.trim() }); }

    async function load() {
      loading.value = true;
      const p = { page: 1, size: 12 };
      for (const k of ['district', 'metro', 'rooms', 'rentType', 'type', 'orient', 'sort', 'q']) {
        if (route.query[k]) p[k] = route.query[k];
      }
      if (route.query.elevator) p.elevator = '1';
      const band = RENT_BANDS.find((b) => b.key === route.query.rent);
      if (band) {
        if (band.min) p.rentMin = band.min;
        if (band.max) p.rentMax = band.max;
      }
      if (route.query.rentMin) p.rentMin = route.query.rentMin;
      if (route.query.rentMax) p.rentMax = route.query.rentMax;

      try {
        const res = await api.houses(p);
        data.value = res;
      } catch (e) {
        toast(e.message || '房源加载失败', 'err');
      } finally {
        loading.value = false;
      }
    }

    watch(() => route.fullPath, () => { load(); }, { immediate: true });
    watch(() => route.query.q, (v) => { keyword.value = v || ''; });

    return {
      state, data, loading, mode, keyword, custom, filters,
      RENT_BANDS, ROOM_OPTS, SORTS,
      cur, isAll, setOn, setQuery,
      pickDistrict, pickMetro, pickRent, applyCustomRent, pickRooms, pickRentType, pickSort,
      toggleElevator, submitSearch,
    };
  },
  template: `
      <h1>大连租房</h1>

      <form class="search" role="search" @submit.prevent="submitSearch">
        <input type="search" aria-label="用一句话描述你想找的房子" placeholder="说说你想住哪儿，例如「沙河口 两室 3000 以内 有电梯」" v-model="keyword">
        <RouterLink class="btn" to="/agent" style="display:inline-flex;align-items:center;text-decoration:none">问 AI</RouterLink>
      </form>

      <section class="filters" aria-label="筛选">
        <div class="frow">
          <span class="flabel">位置</span>
          <div class="modes" role="tablist" aria-label="位置方式">
            <button class="mode" :class="{ 'is-on': mode === 'region' }" role="tab" :aria-selected="mode === 'region' ? 'true' : 'false'" data-mode="region" @click="mode = 'region'">区域</button>
            <button class="mode" :class="{ 'is-on': mode === 'metro' }" role="tab" :aria-selected="mode === 'metro' ? 'true' : 'false'" data-mode="metro" @click="mode = 'metro'">地铁</button>
          </div>
          <div class="fvals" id="f-region" v-show="mode === 'region'">
            <button class="opt" :class="{ 'is-on': isAll('district') }" :aria-pressed="isAll('district') ? 'true' : 'false'" @click="pickDistrict('全部')">全部</button>
            <button v-for="d in filters.districts.filter(x => x !== '全部')" :key="d" class="opt"
              :class="{ 'is-on': setOn('district', d) }" :aria-pressed="setOn('district', d) ? 'true' : 'false'"
              @click="pickDistrict(d)">{{ d }}</button>
          </div>
          <div class="fvals" id="f-metro" v-show="mode === 'metro'">
            <button class="opt" :class="{ 'is-on': isAll('metro') }" :aria-pressed="isAll('metro') ? 'true' : 'false'" @click="pickMetro('全部')">全部</button>
            <button v-for="mt in filters.metros" :key="mt" class="opt"
              :class="{ 'is-on': setOn('metro', mt) }" :aria-pressed="setOn('metro', mt) ? 'true' : 'false'"
              @click="pickMetro(mt)">{{ mt }}</button>
          </div>
        </div>
        <div class="frow">
          <span class="flabel">租金</span>
          <div class="fvals">
            <button class="opt" :class="{ 'is-on': !cur('rent') && !cur('rentMin') && !cur('rentMax') }"
              :aria-pressed="!cur('rent') && !cur('rentMin') && !cur('rentMax') ? 'true' : 'false'" @click="pickRent('')">全部</button>
            <button v-for="b in RENT_BANDS" :key="b.key" class="opt"
              :class="{ 'is-on': setOn('rent', b.key) }" :aria-pressed="setOn('rent', b.key) ? 'true' : 'false'"
              @click="pickRent(b.key)">{{ b.label }}</button>
            <span class="range"><input type="text" inputmode="numeric" aria-label="最低租金" placeholder="最低" v-model="custom.min" @change="applyCustomRent"> – <input type="text" inputmode="numeric" aria-label="最高租金" placeholder="最高" v-model="custom.max" @change="applyCustomRent"> 元</span>
          </div>
        </div>
        <div class="frow">
          <span class="flabel">房型</span>
          <div class="fvals">
            <button class="opt" :class="{ 'is-on': isAll('rooms') }" :aria-pressed="isAll('rooms') ? 'true' : 'false'" @click="pickRooms('全部')">全部</button>
            <button v-for="r in ROOM_OPTS" :key="r.value" class="opt"
              :class="{ 'is-on': setOn('rooms', r.value) }" :aria-pressed="setOn('rooms', r.value) ? 'true' : 'false'"
              @click="pickRooms(r.value)">{{ r.label }}</button>
          </div>
        </div>
        <div class="frow">
          <span class="flabel">类型</span>
          <div class="fvals">
            <button class="opt" :class="{ 'is-on': isAll('rentType') }" :aria-pressed="isAll('rentType') ? 'true' : 'false'" @click="pickRentType('全部')">全部</button>
            <button v-for="rt in filters.rentTypes" :key="rt" class="opt"
              :class="{ 'is-on': setOn('rentType', rt) }" :aria-pressed="setOn('rentType', rt) ? 'true' : 'false'"
              @click="pickRentType(rt)">{{ rt }}</button>
          </div>
        </div>
        <div class="frow">
          <span class="flabel">更多</span>
          <div class="fvals">
            <select class="select-sm" aria-label="房屋类型" :value="cur('type')" @change="setQuery({ type: $event.target.value })">
              <option value="">房屋类型</option>
              <option v-for="t in filters.houseTypes" :key="t" :value="t">{{ t }}</option>
            </select>
            <select class="select-sm" aria-label="朝向" :value="cur('orient')" @change="setQuery({ orient: $event.target.value })">
              <option value="">朝向</option>
              <option v-for="o in filters.orients" :key="o" :value="o">{{ o }}</option>
            </select>
            <label class="check"><input type="checkbox" :checked="cur('elevator') === '1'" @change="toggleElevator"> 电梯房</label>
          </div>
        </div>
      </section>

      <div class="sortbar">
        <div class="sorts">
          <button v-for="s in SORTS" :key="s.key" class="sort"
            :class="{ 'is-on': s.key === 'default' ? !cur('sort') : cur('sort') === s.key }"
            :aria-pressed="(s.key === 'default' ? !cur('sort') : cur('sort') === s.key) ? 'true' : 'false'"
            @click="pickSort(s.key)">{{ s.label }}</button>
        </div>
        <p class="note">{{ loading ? '正在加载…' : (data.total + ' 套在架 · 今日新上 ' + ((data.summary && data.summary.todayNew) || 0) + ' 套') }}</p>
      </div>

      <section class="masonry">
        <HouseCard v-for="h in data.items" :key="h.id" :item="h" />
      </section>
      <p class="empty" v-if="!loading && !data.items.length">没有符合条件的房源，试试放宽筛选条件。</p>
  `,
};
