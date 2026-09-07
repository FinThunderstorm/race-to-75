import { expect, test } from '@playwright/test'

const previewUser = {
  id: 'preview-user',
  email: 'preview@example.com',
  display_name: 'Preview Racer',
  role: 'member'
}

test('serves the SPA shell with the login screen for unauthenticated users', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Log in with passkey' })).toBeVisible()
})

test('sample/live link loads Withings history, persists on reload, and switches back', async ({
  page
}) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: previewUser }))
  let requests = 0
  await page.route('**/api/race', (route) => {
    requests += 1
    return route.fulfill({
      json: {
        participants: [
          {
            id: 'live-one',
            name: 'Live Racer',
            measurements: [
              { measuredAt: '2010-01-01T08:00:00.000Z', weightKg: 130 },
              { measuredAt: '2026-09-01T08:00:00.000Z', weightKg: 85 }
            ]
          },
          { id: 'empty', name: 'Waiting Racer', measurements: [] }
        ]
      }
    })
  })
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Sample data' })).toBeVisible()
  expect(requests).toBe(0)
  await page.getByRole('link', { name: 'Sample data' }).click()
  await expect(page).toHaveURL(/data=live/)
  await expect(page.getByRole('button', { name: /Live Racer 85.0/ })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Waiting Racer No Withings readings/ })
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /Heikki/ })).toHaveCount(0)
  await page.getByText('View live readings', { exact: true }).click()
  await expect(
    page.getByRole('row', { name: 'Live Racer 130.0 85.0 10.0 2026-09-01' })
  ).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: 'Live data' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Live Racer/ })).toBeVisible()
  await page.getByRole('link', { name: 'Live data' }).click()
  await expect(page.getByRole('button', { name: /Heikki/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Live Racer/ })).toHaveCount(0)
})

test('live data errors can be retried and empty responses never show sample participants', async ({
  page
}) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: previewUser }))
  let fail = true
  await page.route('**/api/race', (route) =>
    fail
      ? route.fulfill({ status: 500, json: { error: 'Unavailable' } })
      : route.fulfill({ json: { participants: [] } })
  )
  await page.goto('/?data=live')
  await expect(page.getByRole('alert')).toContainText('Could not load Withings data')
  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('status')).toHaveText(
    'No Withings measurements have been imported yet.'
  )
  await expect(page.getByRole('button', { name: /Heikki/ })).toHaveCount(0)
  await page.getByRole('link', { name: 'Live data' }).click()
  await expect(page.getByRole('button', { name: /Heikki/ })).toBeVisible()
})

test('sample dashboard supports highlighting racers and reading the data on mobile', async ({
  page
}) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 'preview-user',
        email: 'preview@example.com',
        display_name: 'Preview Racer',
        role: 'member'
      }
    })
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await expect(page.getByText('Sample data', { exact: true })).toBeVisible()
  const racer = page.getByRole('button', { name: /Mikko/ })
  await racer.click()
  await expect(racer).toHaveAttribute('aria-pressed', 'true')
  await racer.click()
  await expect(racer).toHaveAttribute('aria-pressed', 'false')

  await page.getByText('View sample readings', { exact: true }).click()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByRole('row', { name: 'Sanna 84.0 73.2 0.0' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  )
})
