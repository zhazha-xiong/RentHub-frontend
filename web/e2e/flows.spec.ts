/**
 * L3 端到端：主流程 + 三角色越权
 *
 * 每个用例前重置假后端数据（POST /__mock__/reset），保证用例彼此独立。
 * 运行：npm run test:e2e（CI 里自动装 chromium）
 */
import { expect, test, type Page } from '@playwright/test'

const MOCK = 'http://127.0.0.1:8787'

test.beforeEach(async ({ request }) => {
  const res = await request.post(`${MOCK}/__mock__/reset`)
  expect(res.ok()).toBeTruthy()
})

async function login(page: Page, role: '租客' | '商家' | '管理员', account: string) {
  await page.goto('/login')
  await page.getByRole('tab', { name: role }).click()
  await page.getByPlaceholder('4-20 位字母或数字').fill(account)
  await page.getByPlaceholder('至少 8 位，含字母与数字').fill('renthub123')
  await page.getByRole('button', { name: '登录', exact: true }).click()
}

test('主流程：租客登录 → 找房 → 详情 → 下单 → 支付', async ({ page }) => {
  await login(page, '租客', 'xiaofs')
  await expect(page.locator('.filters')).toBeVisible()

  /* 列表 → 详情 */
  await page.locator('a[href="/listings/101"]').first().click()
  await expect(page.getByRole('link', { name: '立即租下' })).toBeVisible()
  await expect(page.getByText('AI 参考价')).toBeVisible()

  /* 下单 */
  await page.getByRole('link', { name: '立即租下' }).click()
  await expect(page.getByRole('heading', { name: '确认订单' })).toBeVisible()
  await page.getByRole('button', { name: '提交订单' }).click()

  /* 订单详情 → 支付 */
  await expect(page.getByText(/订单 2026/)).toBeVisible()
  await page.getByRole('button', { name: /模拟支付/ }).click()
  await expect(page.getByText('支付', { exact: true }).first()).toBeVisible()
})

test('主流程：商家登录 → 接单 → 完成', async ({ page }) => {
  /* 先用接口造一单，避免依赖列表顺序 */
  const tenantLogin = await page.request.post(`${MOCK}/api/v1/auth/login`, {
    data: { account: 'xiaofs', password: 'renthub123', role: 'tenant' },
  })
  const tenantToken = (await tenantLogin.json()).access_token as string
  const order = await page.request.post(`${MOCK}/api/v1/orders`, {
    headers: { Authorization: `Bearer ${tenantToken}` },
    data: { listing_id: 107, months: 6, check_in_date: '2026-12-01' },
  })
  expect(order.status()).toBe(201)

  await login(page, '商家', 'xingchen')
  await page.getByRole('link', { name: '订单管理' }).first().click()
  await expect(page.getByRole('heading', { name: '订单管理' })).toBeVisible()

  await page.getByRole('button', { name: '接单' }).first().click()
  await expect(page.getByText('已接单').first()).toBeVisible()

  await page.getByRole('button', { name: '完成' }).first().click()
  await expect(page.getByText('订单已完成').first()).toBeVisible()
})

test('越权：租客访问商家端被路由守卫拦下', async ({ page }) => {
  await login(page, '租客', 'xiaofs')
  await page.goto('/merchant/listings')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.filters')).toBeVisible()
})

test('越权：未登录访问订单页跳登录并带回跳地址', async ({ page }) => {
  await page.goto('/orders')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
})

test('管理员：资质审核通过 / 驳回原因校验', async ({ page }) => {
  await login(page, '管理员', 'guanli')
  await expect(page.getByRole('heading', { name: '资质审核' })).toBeVisible()
  await expect(page.getByText('海滨小屋')).toBeVisible()

  /* 驳回：原因不足 10 字时前端拦住 */
  await page.getByRole('button', { name: '驳回' }).first().click()
  await page.getByPlaceholder('例如：营业执照照片不清晰，请重新上传彩色原件').fill('太模糊')
  await page.getByRole('button', { name: '确认驳回' }).click()
  await expect(page.getByText('驳回原因不少于 10 个字')).toBeVisible()

  /* 改成合规原因后成功 */
  await page.getByPlaceholder('例如：营业执照照片不清晰，请重新上传彩色原件').fill('营业执照照片不清晰，请重新上传彩色原件')
  await page.getByRole('button', { name: '确认驳回' }).click()
  await expect(page.getByText('已驳回').first()).toBeVisible()
})

test('AI 找房：流式回答并返回房源卡片', async ({ page }) => {
  await login(page, '租客', 'xiaofs')
  await page.goto('/ai')
  await page.getByPlaceholder(/例如：沙河口/).fill('沙河口 两室 3000 以内')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText(/为你找到|没有完全符合/)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('已识别条件')).toBeVisible()
})
