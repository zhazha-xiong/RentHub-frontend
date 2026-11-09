import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
/* 顺序很重要：antd reset → 旧版美术（legacy.css，与 legacy/v2-static/public/style.css 同源）
   → 本项目的少量补充（global.css）。这样旧版的排版/字体/组件样式优先于 antd reset。 */
import '@/styles/legacy.css'
import '@/styles/global.css'
import App from '@/App.vue'
import { router } from '@/router'

createApp(App).use(createPinia()).use(router).use(Antd).mount('#app')
