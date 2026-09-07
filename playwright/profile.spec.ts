import { expect, test } from '@playwright/test'

test('signed-in name opens the profile with connection controls and retryable failures', async ({
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
  await page.getByRole('link', { name: 'Profile Racer', exact: true }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible()
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
})

test('profile requires login', async ({ page }) => {
  await page.goto('/profile')
  await expect(page.getByRole('button', { name: 'Log in with passkey' })).toBeVisible()
})
