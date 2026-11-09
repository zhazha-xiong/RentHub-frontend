import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
// @ts-expect-error 假后端是纯 JS（Node 内置 http），没有类型声明
import { startMockServer } from './mock/server.mjs'

const MOCK_PORT = Number(process.env.MOCK_PORT || 8787)
const MOCK_TARGET = `http://127.0.0.1:${MOCK_PORT}`

/** /api 与 /mock-files（假后端的占位图）都转发到假后端 */
const proxy = {
  '/api': { target: MOCK_TARGET, changeOrigin: false },
  '/mock-files': { target: MOCK_TARGET, changeOrigin: false },
}

/**
 * dev / preview 时自动拉起假后端，做到「一条命令就能跑」：
 * 前端始终只认 /api/v1，由 Vite 代理到假后端 —— 将来换真后端
 * 只要改 VITE_API_BASE 或这里的 target，页面代码零改动。
 *
 * 端口已被占用时（例如 Playwright 已单独起了一个 mock、或本地已有服务）
 * 静默跳过，不阻断 dev/preview —— 否则 E2E 会因为 EADDRINUSE 起不来。
 */
function mockBackend() {
  const ensure = async () => {
    try {
      await startMockServer({ port: MOCK_PORT, quiet: true })
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'EADDRINUSE') {
        console.warn(`[mock] 端口 ${MOCK_PORT} 已被占用，复用已有假后端`)
        return
      }
      throw err
    }
  }
  return {
    name: 'renthub-mock-backend',
    async configureServer() {
      await ensure()
    },
    async configurePreviewServer() {
      await ensure()
    },
  }
}

export default defineConfig({
  plugins: [vue(), mockBackend()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy,
  },
  preview: {
    port: 4173,
    proxy,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'vue-router', 'pinia'],
          antd: ['ant-design-vue'],
        },
      },
    },
  },
})
