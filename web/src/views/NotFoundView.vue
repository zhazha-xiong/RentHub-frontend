<script setup lang="ts">
import { useRouter } from 'vue-router'

/**
 * 404 —— v2 没有这一页，这里用 v2 自己的 .empty + .btn 拼，
 * 不引入 antd 的 Result，保持与其它页面同一套排版。
 */
const router = useRouter()
</script>

<template>
  <div class="empty" style="padding: 120px 0">
    <p style="font-size: 40px; font-weight: 700; color: var(--text-3); margin: 0 0 8px">404</p>
    <p style="font-size: 16px; color: var(--text); margin: 0 0 6px">页面不存在</p>
    <p class="hint" style="margin-bottom: 18px">你访问的链接没有对应的页面，可能已经被删除了。</p>
    <button class="btn" type="button" @click="router.push('/')">回到找房首页</button>
  </div>
</template>
