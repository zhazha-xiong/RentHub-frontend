/**
 * 房源详情（v2 detail.html）
 *
 * 结构逐一对应原页面：.crumbs → .detail → .media/.panel… + aside.info。
 * 数据全部来自 /api/houses/:id（含设施字典、商家信息、相关推荐、是否已收藏）。
 */
import { ref, computed, watch, useRoute, useRouter } from '../lib.js';
import { api } from '../api.js';
import { state, setCounts, toast } from '../store.js';
import IconDefs from '../components/IconDefs.js';

const KIND_CLASS = { blue: '', hue: 'hue', plain: 'plain', warn: 'warn', ok: 'ok' };

export default {
  name: 'DetailView',
  components: { IconDefs },
  setup() {
    const route = useRoute();
    const router = useRouter();

    const house = ref(null);
    const related = ref([]);
    const favorited = ref(false);
    const loading = ref(true);
    const error = ref('');
    const index = ref(0);

    const tagClass = (t) => `tag ${KIND_CLASS[t.kind] || ''}`.trim();
    const gallery = computed(() => house.value?.images || []);
    const current = computed(() => gallery.value[index.value] || gallery.value[0] || { src: '', alt: '' });
    const thumbs = computed(() => gallery.value.slice(0, 4));
    const moreCount = computed(() => Math.max(0, gallery.value.length - 4));

    function go(step) {
      const n = gallery.value.length;
      if (!n) return;
      index.value = (index.value + step + n) % n;
    }
    function select(i) { index.value = i; }

    async function load() {
      loading.value = true;
      error.value = '';
      try {
        const res = await api.house(route.params.id);
        house.value = res.house;
        related.value = res.related || [];
        favorited.value = Boolean(res.favorited);
        index.value = 0;
        if (res.counts) setCounts(res.counts);
      } catch (e) {
        error.value = e.message || '房源加载失败';
      } finally {
        loading.value = false;
      }
    }

    async function toggleFav() {
      if (!state.me) {
        router.push({ path: '/login', query: { role: 'tenant', from: route.fullPath } });
        return;
      }
      const next = !favorited.value;
      favorited.value = next;
      try {
        const r = await api.setFavorite(house.value.id, next);
        if (r?.counts) setCounts(r.counts);
        toast(next ? '已加入收藏' : '已取消收藏', 'ok');
      } catch (e) {
        favorited.value = !next;
        toast(e.message || '操作失败', 'err');
      }
    }

    watch(() => route.params.id, () => { if (route.name === 'detail') load(); }, { immediate: true });

    return {
      state, house, related, favorited, loading, error, index,
      current, thumbs, moreCount, tagClass, go, select, toggleFav, gallery,
    };
  },
  template: `
  <div v-if="loading" class="page-loading">正在加载房源详情…</div>
  <div v-else-if="error" class="page-loading">{{ error }}　<RouterLink to="/">返回列表</RouterLink></div>
  <template v-else-if="house">
    <IconDefs />
    <p class="crumbs"><RouterLink to="/">找房</RouterLink><template v-for="(b, i) in house.breadcrumb" :key="i"><span>/</span>{{ b }}</template></p>
    <div class="detail">
      <div>
        <div class="media">
          <div class="stage">
            <img :src="current.src" :alt="current.alt || '客厅实拍，教学演示图片'">
            <button class="nav prev" aria-label="上一张" @click="go(-1)">‹</button>
            <button class="nav next" aria-label="下一张" @click="go(1)">›</button>
            <span class="counter">{{ index + 1 }} / {{ gallery.length }}</span>
          </div>
          <div class="thumbs">
            <button v-for="(img, i) in thumbs" :key="i" class="th" :class="{ on: index === i }" :aria-label="'第 ' + (i + 1) + ' 张'" @click="select(i)">
              <img :src="img.src" alt="">
            </button>
            <button v-if="moreCount" class="th more" :aria-label="'查看全部 ' + gallery.length + ' 张'" @click="select(4)">+{{ moreCount }}</button>
          </div>
        </div>

        <section class="panel">
          <h2>房源描述</h2>
          <p class="prose">{{ house.description.text }}</p>
          <div class="kv" v-if="house.description.kv.length">
            <span v-for="kv in house.description.kv" :key="kv.k"><b>{{ kv.k }}</b> {{ kv.v }}</span>
          </div>
        </section>

        <section class="panel">
          <h2>位置与交通</h2>
          <p class="prose">{{ house.place.address }}</p>
          <div class="kv">
            <span v-if="house.place.area"><b>小区</b> {{ house.place.area }}</span>
            <span v-if="house.place.metro.line"><b>地铁</b> {{ house.place.metro.line }}</span>
            <span v-if="house.place.metro.walkM"><b>步行</b> {{ house.place.metro.walkM }} 米</span>
          </div>
        </section>

        <section class="panel">
          <h2>卧室设施</h2>
          <div class="facgrid">
            <div class="fac" v-for="f in house.facilities.bedroom" :key="f.label">
              <svg class="ic" aria-hidden="true"><use :href="'#' + f.icon"></use></svg><span>{{ f.label }}</span>
            </div>
          </div>
          <h2 style="margin-top:24px">公共设施</h2>
          <div class="facgrid">
            <div class="fac" v-for="f in house.facilities.public" :key="f.label">
              <svg class="ic" aria-hidden="true"><use :href="'#' + f.icon"></use></svg><span>{{ f.label }}</span>
            </div>
          </div>
        </section>

        <section class="panel">
          <h2>相关推荐</h2>
          <p class="hint" style="margin:0 0 12px">同区域、同户型、价格接近的 {{ related.length }} 套</p>
          <div class="related">
            <RouterLink class="rel" v-for="r in related" :key="r.id" :to="'/house/' + r.id">
              <img :src="r.cover" alt="">
              <p class="t">{{ r.title }}</p>
              <p class="m">{{ r.area }}㎡ · {{ r.orient }}</p>
              <p class="p"><b>{{ fmt(r.rent) }}</b> 元/月</p>
            </RouterLink>
          </div>
        </section>
      </div>

      <aside class="info">
        <h1 class="title">{{ house.title }}</h1>
        <p class="meta">{{ house.meta }}</p>
        <div class="price-row"><b>{{ fmt(house.pricing.rent) }}</b><span>元/月 · 押金 {{ fmt(house.pricing.deposit) }} · 服务费 {{ fmt(house.pricing.serviceFee) }}</span></div>
        <div class="tags">
          <span v-for="t in house.tags" :key="t.text" :class="tagClass(t)">{{ t.text }}</span>
        </div>
        <dl class="spec">
          <div><dt>户型</dt><dd>{{ house.spec.roomsText }}</dd></div>
          <div><dt>面积</dt><dd>{{ house.spec.areaText }}</dd></div>
          <div><dt>楼层</dt><dd>{{ house.spec.floorText }}</dd></div>
          <div><dt>朝向</dt><dd>{{ house.spec.orient }}</dd></div>
          <div><dt>装修</dt><dd>{{ house.spec.decor }}</dd></div>
          <div><dt>类型</dt><dd>{{ house.spec.type }}</dd></div>
          <div><dt>租赁</dt><dd>{{ house.spec.rentType }}</dd></div>
          <div><dt>可入住</dt><dd>{{ house.availability.availableFrom }}</dd></div>
        </dl>
        <div class="merchant">
          <span class="ava">{{ house.merchant.initial }}</span>
          <div><b>{{ house.merchant.name }}</b><p>{{ house.merchant.listings }} 套在架 · {{ house.merchant.responseText }}</p></div>
        </div>
        <div class="actions">
          <button class="btn ghost" @click="toggleFav">{{ favorited ? '已收藏' : '收藏' }}</button>
          <RouterLink class="btn" :to="'/booking/' + house.id" style="display:flex;align-items:center;justify-content:center;text-decoration:none">立即租下</RouterLink>
        </div>

        <div class="askai">
          <div class="ah"><span class="dot-ai" aria-hidden="true"></span><b>问问 AI</b></div>
          <p class="q1">「这套采光和通勤怎么样？」</p>
          <div class="qh">
            <button type="button" @click="$router.push('/agent')">离地铁多远</button>
            <button type="button" @click="$router.push('/agent')">和附近同价位比</button>
          </div>
          <form class="qform" @submit.prevent="$router.push('/agent')">
            <input type="text" placeholder="就这套继续问" aria-label="就这套继续问">
            <button class="btn sm" type="submit">发送</button>
          </form>
        </div>
      </aside>
    </div>
  </template>
  `,
};
