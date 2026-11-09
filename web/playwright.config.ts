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
    /* CI 里优先用 GitHub runner 预装的 Google Chrome：省掉每次下载 Chromium 的 21s
       （其中 10.8s 是 apt 装系统库，缓存不了；浏览器二进制只有 9.2s，不值得为它缓存 270MB）。
       workflow 会在找不到 google-chrome 时回退安装 Playwright Chromium，并把 PW_CHANNEL 留空，
       所以这里用环境变量切换，本地默认仍用 Playwright 自带的 chromium。 */
    channel: (process.env.PW_CHANNEL as 'chrome' | undefined) || undefined,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  /*
   * 只起 preview 一个 webServer：假后端由 vite.config.ts 的 mockBackend 插件
   * 在 configurePreviewServer 里同进程拉起（监听 MOCK_PORT=8787）。
   * 不要再单独配 `node mock/server.mjs` —— 两个进程抢 8787 会 EADDRINUSE。
   *
   * 必须显式 --host 127.0.0.1：vite preview 默认 host=localhost，Linux 上可能解析到
   * ::1（IPv6），而 baseURL 是 127.0.0.1 → 探测能过、page.goto 却 ERR_CONNECTION_REFUSED。
   */
  webServer: [
    {
      command: 'npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
      port: 4173,
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
      env: { MOCK_PORT: '8787' },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
