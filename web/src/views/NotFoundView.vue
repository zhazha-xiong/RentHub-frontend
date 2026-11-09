<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div style="min-height: 100vh; display: grid; place-items: center; background: var(--rh-bg)">
    <a-result status="404" title="页面不存在" sub-title="你访问的链接没有对应的页面">
      <template #extra>
        <a-button type="primary" @click="router.push('/')">回到找房首页</a-button>
      </template>
    </a-result>
  </div>
</template>
