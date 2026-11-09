<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { theme } from '@/theme'
</script>

<template>
  <!-- auto-insert-space-in-button=false：否则 antd 会把「登录」渲染成「登 录」，
       既不符合旧版文案，也让按名称定位变得脆弱 -->
  <a-config-provider :theme="theme" :locale="zhCN" :auto-insert-space-in-button="false">
    <router-view />
  </a-config-provider>
</template>
