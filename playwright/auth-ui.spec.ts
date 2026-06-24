import { expect, test } from '@playwright/test'

import { seedEnrollment } from './auth-helpers'
import { addVirtualAuthenticator } from './webauthn'

test('enroll then see the signed-in shell via the UI', async ({ page }) => {
  const { rawToken } = await seedEnrollment({
    email: `ui-${Date.now()}@example.com`,
    displayName: 'UI Tester'
  })

  await page.addInitScript(() => {
    if (typeof globalThis.PublicKeyCredential === 'undefined') {
      Object.defineProperty(globalThis, 'PublicKeyCredential', {
        value: function PublicKeyCredential() {},
        configurable: true,
        writable: true
      })
    }
  })

  await page.goto('/')
  await addVirtualAuthenticator(page)

  await page.goto(`/enroll?token=${rawToken}`)
  await page.getByRole('button', { name: 'Create passkey' }).click()

  await expect(page.getByText('Signed in as UI Tester')).toBeVisible()

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('button', { name: 'Log in with passkey' })).toBeVisible()
})
