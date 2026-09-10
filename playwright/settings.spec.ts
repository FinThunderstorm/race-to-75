import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/profile', (route) => route.fulfill({ json: { heightCm: null } }))
  await page.route('**/api/biceps-measurements', (route) =>
    route.fulfill({ json: { measurements: [] } })
  )
  await page.route('**/api/integrations/eufy/status', (route) =>
    route.fulfill({ json: { status: 'disconnected' } })
  )
})

test('signed-in name opens settings with connection controls and retryable failures', async ({
  page
}) => {
  const withings = page.getByRole('region', { name: 'Withings', exact: true })
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 'profile',
        display_name: 'Profile Racer',
        email: 'profile@example.com',
        role: 'member'
      }
    })
  )
  let adminRequests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/admin/')) {
      adminRequests += 1
    }
  })
  let connected = true
  let statusFailed = true
  let disconnectFailed = true
  await page.route('**/api/integrations/withings/status', (route) =>
    statusFailed
      ? route.fulfill({ status: 500, json: { error: 'Unavailable' } })
      : route.fulfill({ json: { connected, configured: true, automaticUpdates: false } })
  )
  await page.route('**/api/integrations/withings', (route) => {
    expect(route.request().method()).toBe('DELETE')
    if (disconnectFailed) {
      return route.fulfill({ status: 500, json: { error: 'Unavailable' } })
    }
    connected = false
    return route.fulfill({ status: 204 })
  })
  await page.goto('/')
  await expect(page.locator('.dashboard-footer').getByRole('link')).toHaveCount(1)
  await page.getByRole('link', { name: 'Profile Racer', exact: true }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('heading', { name: 'Käyttäjähallinta' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Asetukset' })).toBeVisible()
  await expect(page.getByText('profile@example.com', { exact: true })).toBeVisible()
  await expect(withings.getByRole('alert')).toContainText(
    'Withings-yhteyden tarkistaminen epäonnistui'
  )
  statusFailed = false
  await withings.getByRole('button', { name: 'Yritä uudelleen', exact: true }).click()
  await expect(withings.getByRole('status')).toHaveText('Yhdistetty')
  await withings.getByRole('button', { name: 'Katkaise Withings-yhteys' }).click()
  await expect(withings.getByRole('alert')).toHaveText(
    'Withings-yhteyden katkaiseminen epäonnistui. Yritä uudelleen.'
  )
  disconnectFailed = false
  await withings.getByRole('button', { name: 'Katkaise Withings-yhteys' }).click()
  await expect(withings.getByRole('status')).toHaveText('Ei yhdistetty')
  const connect = withings.getByRole('link', { name: 'Yhdistä Withings', exact: true })
  await expect(connect).toHaveAttribute('href', '/api/integrations/withings/connect')
  await page.route('**/api/integrations/withings/connect', (route) =>
    route.fulfill({ status: 302, headers: { location: '/profile?withings=cancelled' } })
  )
  await connect.click()
  await expect(
    page.getByText('Yhdistäminen peruutettu. Voit yrittää uudelleen alta.')
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page).toHaveURL(/\/$/)
  expect(adminRequests).toBe(0)
})

test('settings requires login', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: 'Kirjaudu sisään pääsyavaimella' })).toBeVisible()
})

for (const path of ['/profile', '/admin']) {
  test(`${path} redirects to settings and preserves integration results`, async ({ page }) => {
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        json: {
          id: 'settings-member',
          display_name: 'Settings Member',
          email: 'settings@example.com',
          role: 'member'
        }
      })
    )
    await page.route('**/api/integrations/withings/status', (route) =>
      route.fulfill({
        json: {
          connected: true,
          configured: true,
          automaticUpdates: true
        }
      })
    )
    await page.goto(`${path}?withings=connected&sync=failed#withings-heading`)
    await expect(page).toHaveURL(/\/settings\?withings=connected&sync=failed#withings-heading$/)
    await expect(page.getByRole('heading', { name: 'Asetukset', exact: true })).toBeVisible()
    await expect(page.getByText('Withings yhdistetty.', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Withings', exact: true }).getByRole('alert')
    ).toContainText('mittausten tuonti epäonnistui')
    await expect(page.getByRole('heading', { name: 'Käyttäjähallinta' })).toHaveCount(0)
  })
}
