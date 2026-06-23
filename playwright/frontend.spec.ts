import { expect, test } from '@playwright/test'

test('serves the SPA shell with the race-to-75 heading', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'race-to-75' })).toBeVisible()
})
