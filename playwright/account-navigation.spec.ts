import { expect, test } from '@playwright/test'

const user = { id: 'account', display_name: 'Account Racer', email: 'account@example.com' }

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: { measurements: [], users: [] } }))
  await page.route('**/api/profile', (route) =>
    route.fulfill({ json: { heightCm: 180, sex: 'male' } })
  )
  await page.route('**/api/admin/score-settings', (route) =>
    route.fulfill({ json: { components: ['bmi'] } })
  )
  await page.route('**/api/integrations/eufy/status', (route) =>
    route.fulfill({ json: { status: 'disconnected' } })
  )
  await page.route('**/api/integrations/withings/status', (route) =>
    route.fulfill({ json: { connected: false, configured: true, automaticUpdates: false } })
  )
  await page.route('**/api/race', (route) => route.fulfill({ json: { participants: [] } }))
})

for (const role of ['member', 'admin']) {
  test(`${role} has top-right account navigation and a personal profile`, async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: { ...user, role } }))
    let adminRequests = 0
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/admin/')) {
        adminRequests++
      }
    })
    await page.goto('/?mode=biceps')
    const nav = page.getByRole('navigation', { name: 'Oma tili' })
    await expect(nav.getByRole('link', { name: 'Profiili', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Ylläpito', exact: true })).toHaveCount(
      role === 'admin' ? 1 : 0
    )
    const bounds = (await nav.boundingBox())!
    const viewport = page.viewportSize()!
    expect(bounds.y).toBeLessThan(100)
    expect(bounds.x + bounds.width).toBeGreaterThan(viewport.width - 80)
    await expect(page.locator('.dashboard-footer').getByRole('link')).toHaveCount(0)
    await nav.getByRole('link', { name: 'Profiili', exact: true }).click()
    await expect(page).toHaveURL(/\/profile\?mode=biceps$/)
    await expect(page.getByRole('heading', { name: 'Oma profiili', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Omat mittaukset', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Käyttäjähallinta', exact: true })).toHaveCount(
      0
    )
    await expect(page.getByRole('region', { name: 'Ihmisarvon mittarit' })).toHaveCount(0)
    expect(adminRequests).toBe(0)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/profile-${role}-mobile.png`, fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: `test-results/profile-${role}-desktop.png`, fullPage: true })
  })
}

test('admin tools have their own page and disappear when the role is revoked', async ({ page }) => {
  let role = 'admin'
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { ...user, role } }))
  await page.route('**/api/admin/users', (route) =>
    role === 'admin'
      ? route.fulfill({ json: { users: [] } })
      : route.fulfill({ status: 403, json: {} })
  )
  await page.goto('/admin?mode=score')
  await expect(page).toHaveURL(/\/admin\?mode=score$/)
  await expect(page.getByRole('heading', { name: 'Ylläpito', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Käyttäjähallinta', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Ihmisarvon mittarit' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Withings', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true })
  role = 'member'
  await page.getByRole('button', { name: 'Päivitä käyttäjät' }).click()
  await expect(page).toHaveURL(/\/profile\?mode=score$/)
  await expect(page.getByRole('form', { name: 'Kutsu käyttäjä' })).toHaveCount(0)
})

test('member opening admin is redirected without requesting admin data', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { ...user, role: 'member' } })
  )
  let requests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/admin/')) {
      requests++
    }
  })
  await page.goto('/admin?mode=dots')
  await expect(page).toHaveURL(/\/profile\?mode=dots$/)
  await expect(page.getByRole('heading', { name: 'Oma profiili' })).toBeVisible()
  expect(requests).toBe(0)
})

test('guests get a login link outside radiator mode and no account links inside it', async ({
  page
}) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: {} }))
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login$/)
  const nav = page.getByRole('navigation', { name: 'Oma tili' })
  await expect(nav.getByRole('link', { name: 'Kirjaudu sisään', exact: true })).toHaveAttribute(
    'href',
    '/login'
  )
  await page.route('**/api/radiator', (route) => route.fulfill({ json: { participants: [] } }))
  await page.goto('/')
  await expect(page.locator('.dashboard--radiator')).toBeVisible()
  await expect(nav).toHaveCount(0)
})
