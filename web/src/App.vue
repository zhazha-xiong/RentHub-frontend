<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { theme } from '@/theme'
</script>

<template>
  <a-config-provider :theme="theme" :locale="zhCN">
    <router-view />
  </a-config-provider>
</template>
