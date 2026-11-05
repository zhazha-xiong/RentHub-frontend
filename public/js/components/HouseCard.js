/**
 * 瀑布流房源卡片
 *
 * DOM 结构与 v2 的 card() 逐字节一致（<a class="card"> → .thumb → .card-body → .card-foot），
 * 只是把模板字符串换成组件，并给「收藏」按钮接上真实行为。
 */
import { computed } from '../lib.js';
import { api } from '../api.js';
import { state, setCounts, toast } from '../store.js';

const KIND_CLASS = { blue: '', hue: 'hue', plain: 'plain', warn: 'warn', ok: 'ok' };

export default {
  name: 'HouseCard',
  props: {
    item: { type: Object, required: true },
  },
  emits: ['favorite'],
  setup(props, { emit }) {
    const tags = computed(() => (props.item.tags || []).slice(0, 2));
    const tagClass = (t) => `tag ${KIND_CLASS[t.kind] || ''}`.trim();

    async function toggleFav(e) {
      e.preventDefault();
      e.stopPropagation();
      const next = !props.item.favorited;
      try {
        props.item.favorited = next;
        emit('favorite', { id: props.item.id, favorited: next });
        const r = await api.setFavorite(props.item.id, next);
        if (r?.counts) setCounts(r.counts);
      } catch (err) {
        props.item.favorited = !next;
        toast(err.message || '收藏失败', 'err');
        if (err.code === 'unauth') {
          window.location.assign('/login?role=tenant&from=' + encodeURIComponent(location.pathname));
        }
      }
    }

    return { tags, tagClass, toggleFav, state };
  },
  template: `
  <RouterLink class="card" :to="'/house/' + item.id">
    <div class="thumb" :style="'--ar:' + item.ar">
      <img :src="item.cover" alt="房源室内实拍，教学演示图片" loading="lazy">
      <button class="fav" :aria-label="'收藏 ' + item.title" :aria-pressed="item.favorited ? 'true' : 'false'" @click="toggleFav">{{ item.favorited ? '已收藏' : '收藏' }}</button>
    </div>
    <div class="card-body">
      <h3 class="card-title">{{ item.title }}</h3>
      <p class="card-meta">{{ item.meta }}</p>
      <p class="card-tags" v-if="tags.length"><span v-for="t in tags" :key="t.text" :class="tagClass(t)">{{ t.text }}</span></p>
      <p class="card-foot"><span class="when">{{ item.when }}上架</span><span class="price"><b>{{ fmt(item.rent) }}</b> 元/月</span></p>
    </div>
  </RouterLink>
  `,
};
