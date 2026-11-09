/**
 * L3 端到端：只验证「页面渲染 + 权限守卫」，不用模拟点击走业务流程
 *
 * 原则（按团队要求）：
 *   · 业务流程的「事情已经发生」由 API 直接制造（下单、接单、审核都用 request 打接口）
 *   · 页面侧只做三件事：注入登录态 → 打开 URL → 断言关键内容渲染出来
 *   · 不点按钮、不填表单，避免受文案/组件实现（如 antd 自动插空格）影响而假失败
 *
 * 每个用例前 POST /__mock__/reset，保证种子数据一致。
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const MOCK = 'http://127.0.0.1:8787'
const API = `${MOCK}/api/v1`

type Role = 'tenant' | 'merchant' | 'admin'
const ACCOUNTS: Record<Role, string> = { tenant: 'xiaofs', merchant: 'xingchen', admin: 'guanli' }

interface Session {
  access_token: string
  refresh_token: string
  user: { id: number; nickname: string; role: Role }
}

test.beforeEach(async ({ request }) => {
  const res = await request.post(`${MOCK}/__mock__/reset`)
  expect(res.ok()).toBeTruthy()
})

/** 直接走登录接口拿令牌（不经过登录页的点击） */
async function apiLogin(request: APIRequestContext, role: Role): Promise<Session> {
  const res = await request.post(`${API}/auth/login`, {
    data: { account: ACCOUNTS[role], password: 'renthub123', role },
  })
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as Session
}

/** 把令牌写进 localStorage，页面加载即为已登录（key 与 src/api/token.ts 一致） */
async function injectSession(page: Page, session: Session) {
  await page.addInitScript(
    (t) => {
      localStorage.setItem('renthub.access_token', t.access)
      localStorage.setItem('renthub.refresh_token', t.refresh)
    },
    { access: session.access_token, refresh: session.refresh_token },
  )
}

async function openAs(page: Page, request: APIRequestContext, role: Role, path: string) {
  const session = await apiLogin(request, role)
  await injectSession(page, session)
  await page.goto(path)
  return session
}

const authHeader = (s: Session) => ({ Authorization: `Bearer ${s.access_token}` })

/* ------------------------------------------------------------------ 公开页面 */

test('首页：筛选器 + 瀑布流卡片渲染', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.filters')).toBeVisible()
  await expect(page.locator('.search input')).toBeVisible()
  const cards = page.locator('.masonry .card')
  await expect(cards.first()).toBeVisible()
  expect(await cards.count()).toBeGreaterThan(0)
  await expect(page.locator('.card .card-title').first()).toHaveText(/.+/)
  await expect(page.locator('.card .price b').first()).toHaveText(/[\d,]+/)
})

test('详情页：旧版图库 / 设施两栏 / 户型 spec / 右侧固定价格 / 相关推荐', async ({ page }) => {
  await page.goto('/listings/101')

  /* 图库 */
  await expect(page.locator('.media .stage img')).toBeVisible()
  await expect(page.locator('.media .stage .counter')).toHaveText(/1 \/ \d+/)
  expect(await page.locator('.thumbs .th').count()).toBeGreaterThan(1)

  /* 设施：旧版两块（卧室 / 公共），各 8 项 */
  await expect(page.getByRole('heading', { name: '卧室设施' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '公共设施' })).toBeVisible()
  expect(await page.locator('.facgrid .fac').count()).toBe(16)

  /* 户型等 spec + 右侧固定价格区 */
  await expect(page.locator('.info .spec')).toContainText('户型')
  await expect(page.locator('.info .spec')).toContainText('楼层')
  await expect(page.locator('.info .spec')).toContainText('朝向')
  await expect(page.locator('.info .price-row b')).toHaveText(/[\d,]+/)
  await expect(page.locator('.info.info-sticky')).toHaveCSS('position', 'sticky')

  /* 其它旧版板块 */
  await expect(page.getByRole('heading', { name: '房源描述' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '位置与交通' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '相关推荐' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'AI 参考价' })).toBeVisible()
})

/* ------------------------------------------------------------------ 租客 */

test('租客订单：API 下单已发生，列表与详情页可见', async ({ page, request }) => {
  const tenant = await apiLogin(request, 'tenant')
  const created = await request.post(`${API}/orders`, {
    headers: authHeader(tenant),
    data: { listing_id: 107, months: 6, check_in_date: '2026-12-01' },
  })
  expect(created.status()).toBe(201)
  const order = (await created.json()) as { id: number; order_no: string }

  await injectSession(page, tenant)

  await page.goto('/orders')
  await expect(page.getByText(order.order_no)).toBeVisible()

  await page.goto(`/orders/${order.id}`)
  await expect(page.getByText(order.order_no)).toBeVisible()
  await expect(page.getByText('状态流水')).toBeVisible()
  await expect(page.getByText('待商家确认').first()).toBeVisible()
})

test('租客收藏：收藏列表渲染', async ({ page, request }) => {
  const tenant = await apiLogin(request, 'tenant')
  await injectSession(page, tenant)
  await page.goto('/favorites')
  const cards = page.locator('a[href^="/listings/"]')
  await expect(cards.first()).toBeVisible()
  expect(await cards.count()).toBeGreaterThan(0)
})

test('租客通知：列表渲染', async ({ page, request }) => {
  await openAs(page, request, 'tenant', '/notifications')
  await expect(page.getByRole('heading', { name: /通知中心/ })).toBeVisible()
  await expect(page.locator('.ant-list-item').first()).toBeVisible()
})

/* ------------------------------------------------------------------ 商家 */

test('商家订单：API 接单已发生，管理页显示已确认', async ({ page, request }) => {
  const tenant = await apiLogin(request, 'tenant')
  const order = (await (
    await request.post(`${API}/orders`, {
      headers: authHeader(tenant),
      data: { listing_id: 107, months: 6, check_in_date: '2026-12-01' },
    })
  ).json()) as { id: number; order_no: string }

  const merchant = await apiLogin(request, 'merchant')
  const confirmed = await request.post(`${API}/orders/${order.id}/confirm`, { headers: authHeader(merchant) })
  expect(confirmed.ok()).toBeTruthy()

  await injectSession(page, merchant)
  await page.goto('/merchant/orders')
  await expect(page.getByText(order.order_no)).toBeVisible()
  await expect(page.getByText('已确认').first()).toBeVisible()
})

test('商家房源管理：房源与状态渲染', async ({ page, request }) => {
  await openAs(page, request, 'merchant', '/merchant/listings')
  await expect(page.getByRole('heading', { name: '房源管理' })).toBeVisible()
  await expect(page.getByText('星海广场 · 2室1厅').first()).toBeVisible()
  await expect(page.getByText('在架').first()).toBeVisible()
})

/* ------------------------------------------------------------------ 管理员 */

test('管理员资质：待审核列表渲染（种子里的待审资质）', async ({ page, request }) => {
  await openAs(page, request, 'admin', '/admin/qualifications')
  await expect(page.getByRole('heading', { name: '资质审核' })).toBeVisible()
  await expect(page.getByText('海滨小屋')).toBeVisible()
  await expect(page.getByText('待审核').first()).toBeVisible()
})

/* ------------------------------------------------------------------ 越权 */

test('越权：租客打开商家端被守卫送回首页', async ({ page, request }) => {
  await openAs(page, request, 'tenant', '/merchant/listings')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.filters')).toBeVisible()
})

test('越权：未登录打开订单页跳登录并带回跳参数', async ({ page }) => {
  await page.goto('/orders')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await expect(page.getByPlaceholder('4-20 位字母或数字')).toBeVisible()
})
