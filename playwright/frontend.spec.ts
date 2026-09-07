import { expect, test } from '@playwright/test'

test('serves the SPA shell with the login screen for unauthenticated users', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Log in with passkey' })).toBeVisible()
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
