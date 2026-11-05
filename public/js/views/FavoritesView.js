/**
 * 我的收藏（v2 favorites.html）
 * 收藏本身存在后端，刷新/换设备都在；排序方式写 URL（?sort=price_asc）。
 */
import { ref, computed, watch, useRoute, useRouter } from '../lib.js';
import { api } from '../api.js';
import { setCounts, toast } from '../store.js';
import HouseCard from '../components/HouseCard.js';

export default {
  name: 'FavoritesView',
  components: { HouseCard },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const items = ref([]);
    const loading = ref(true);
    const sort = computed(() => route.query.sort || 'recent');

    const sorted = computed(() => {
      const list = [...items.value];
      if (sort.value === 'price_asc') list.sort((a, b) => a.rent - b.rent);
      return list;
    });

    async function load() {
      loading.value = true;
      try {
        const res = await api.favorites();
        items.value = res.items;
        setCounts({ favorites: res.total });
      } catch (e) {
        toast(e.message || '收藏加载失败', 'err');
        if (e.code === 'unauth') router.push({ path: '/login', query: { role: 'tenant', from: route.fullPath } });
      } finally {
        loading.value = false;
      }
    }
    watch(() => route.fullPath, load, { immediate: true });

    function setSort(key) {
      router.replace({ path: '/favorites', query: key === 'recent' ? {} : { sort: key } });
    }
    function onFav({ id, favorited }) {
      if (!favorited) items.value = items.value.filter((x) => x.id !== id);
    }

    return { items, sorted, loading, sort, setSort, onFav };
  },
  template: `
  <h1>我的收藏</h1>

  <div class="sortbar">
    <div class="sorts">
      <button class="sort" :class="{ 'is-on': sort === 'recent' }" :aria-pressed="sort === 'recent' ? 'true' : 'false'" @click="setSort('recent')">最近收藏</button>
      <button class="sort" :class="{ 'is-on': sort === 'price_asc' }" :aria-pressed="sort === 'price_asc' ? 'true' : 'false'" @click="setSort('price_asc')">价格从低到高</button>
    </div>
    <p class="note">{{ loading ? '正在加载…' : ('共 ' + sorted.length + ' 套') }}</p>
  </div>

  <section class="masonry">
    <HouseCard v-for="h in sorted" :key="h.id" :item="h" @favorite="onFav" />
  </section>
  <p class="empty" v-if="!loading && !sorted.length">还没有收藏的房源，去<RouterLink to="/">找房</RouterLink>看看。</p>
  `,
};
