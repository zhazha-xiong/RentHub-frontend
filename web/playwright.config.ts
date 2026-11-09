import { defineConfig, devices } from '@playwright/test'

/**
 * L3 E2E：真实浏览器 + 假后端 + 生产构建（vite preview）
 *
 * 本地跑 `npm run test:e2e`（需要先 `npx playwright install chromium`）；
 * CI 里由 .github/workflows/web-ci.yml 负责安装浏览器与构建。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  /*
   * 只起 preview 一个 webServer：假后端由 vite.config.ts 的 mockBackend 插件
   * 在 configurePreviewServer 里同进程拉起（监听 MOCK_PORT=8787）。
   * 不要再单独配 `node mock/server.mjs` —— 两个进程抢 8787 会 EADDRINUSE。
   */
  webServer: [
    {
      command: 'npm run preview -- --port 4173 --strictPort',
      port: 4173,
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
      env: { MOCK_PORT: '8787' },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
