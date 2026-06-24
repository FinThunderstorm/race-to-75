import { expect, test } from '@playwright/test'

test('serves the SPA shell with the login screen for unauthenticated users', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Log in with passkey' })).toBeVisible()
})
