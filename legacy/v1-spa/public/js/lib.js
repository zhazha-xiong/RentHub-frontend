/**
 * Vue / Vue Router 运行时桥接
 *
 * 项目不使用构建工具，所以直接复用 vendor/ 里的官方全局构建：
 *   window.Vue       ← vendor/vue.global.prod.js        （完整版，含模板编译器）
 *   window.VueRouter ← vendor/vue-router.global.prod.js
 * 组件用「对象 + template 字符串」编写，结构与 v2 的 HTML 完全一致（排版不变）。
 */
const V = window.Vue || {};
const R = window.VueRouter || {};

export const {
  createApp, defineComponent, h, ref, reactive, computed, watch, watchEffect,
  onMounted, onUnmounted, onBeforeUnmount, nextTick,
} = V;

export const {
  createRouter, createWebHistory, RouterLink, RouterView, useRoute, useRouter, onBeforeRouteLeave,
} = R;

export const Vue = V;
export const VueRouter = R;

/** 3200 → "3,200" */
export const fmt = (n) => Number(n || 0).toLocaleString('en-US');

/** 路由解析失败时的兜底（打印一次便于排查） */
if (!V.createApp) console.error('[lib] Vue 未加载：请检查 /vendor/vue.global.prod.js');
if (!R.createRouter) console.error('[lib] Vue Router 未加载：请检查 /vendor/vue-router.global.prod.js');
