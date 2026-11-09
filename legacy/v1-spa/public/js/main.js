/**
 * 应用入口
 *
 * 不使用构建工具：Vue / Vue Router 来自 vendor/ 的官方全局构建（见 lib.js），
 * 其余全部是浏览器原生 ES Module —— 改完文件刷新即可，没有编译步骤。
 */
import { createApp, RouterLink, RouterView, fmt } from './lib.js';
import App from './App.js';
import { router, startScrollTracker } from './router.js';
import { state, toast } from './store.js';

const app = createApp(App);

app.component('RouterLink', RouterLink);
app.component('RouterView', RouterView);

/* 模板里可直接用 {{ fmt(x) }} 与 state.me 等 */
app.config.globalProperties.fmt = fmt;
app.config.globalProperties.state = state;

app.config.errorHandler = (err, instance, info) => {
  console.error('[vue error]', info, err);
  toast(err?.message || '页面渲染出错，请刷新重试', 'err');
};

app.use(router);

router.isReady().then(() => {
  app.mount('#app');
  startScrollTracker();
});
