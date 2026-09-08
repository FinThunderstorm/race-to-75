import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/integrations/eufy/status', (route) =>
    route.fulfill({ json: { status: 'disconnected' } })
  )
})

test('signed-in name opens settings with connection controls and retryable failures', async ({
  page
}) => {
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
  await expect(page.getByRole('heading', { name: 'Manage users' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByText('profile@example.com', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Could not check your Withings connection')
  statusFailed = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Connected')
  await page.getByRole('button', { name: 'Disconnect Withings' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Could not disconnect Withings. Please try again.'
  )
  disconnectFailed = false
  await page.getByRole('button', { name: 'Disconnect Withings' }).click()
  await expect(page.getByRole('status')).toHaveText('Not connected')
  const connect = page.getByRole('link', { name: 'Connect Withings', exact: true })
  await expect(connect).toHaveAttribute('href', '/api/integrations/withings/connect')
  await page.route('**/api/integrations/withings/connect', (route) =>
    route.fulfill({ status: 302, headers: { location: '/profile?withings=cancelled' } })
  )
  await connect.click()
  await expect(page.getByText('Connection cancelled. You can try again below.')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'Back to the race' }).click()
  await expect(page).toHaveURL(/\/$/)
  expect(adminRequests).toBe(0)
})

test('settings requires login', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: 'Log in with passkey' })).toBeVisible()
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
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    await expect(page.getByText('Withings connected.', { exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('importing readings failed')
    await expect(page.getByRole('heading', { name: 'Manage users' })).toHaveCount(0)
  })
}
