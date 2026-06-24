import { expect, test } from '@playwright/test'

import { seedEnrollment } from './auth-helpers'
import { addVirtualAuthenticator, createCredential, getAssertion } from './webauthn'

test('GET /auth/me without a session returns 401', async ({ request }) => {
  const response = await request.get('/auth/me')

  expect(response.status()).toBe(401)
})

test('enrolling a passkey from a link logs the user in', async ({ page }) => {
  const { rawToken } = await seedEnrollment({
    email: `enroll-${Date.now()}@example.com`,
    displayName: 'Enroll Tester'
  })

  await page.goto('/')
  await addVirtualAuthenticator(page)

  const optionsResponse = await page.request.post('/auth/enroll/options', {
    data: { token: rawToken }
  })
  expect(optionsResponse.ok()).toBeTruthy()
  const options = await optionsResponse.json()

  const credential = await createCredential(page, options)
  const verifyResponse = await page.request.post('/auth/enroll/verify', {
    data: { token: rawToken, response: credential, deviceName: 'Test device' }
  })
  expect(verifyResponse.ok()).toBeTruthy()

  const meResponse = await page.request.get('/auth/me')
  expect(meResponse.ok()).toBeTruthy()
  expect((await meResponse.json()).display_name).toBe('Enroll Tester')
})

test('POST /auth/enroll/options with a malformed body returns 400', async ({ request }) => {
  const response = await request.post('/auth/enroll/options', { data: { data: {} } })

  expect(response.status()).toBe(400)
})

test('a consumed enrollment token is rejected on second options request', async ({ page }) => {
  const { rawToken } = await seedEnrollment({
    email: `reuse-${Date.now()}@example.com`,
    displayName: 'Reuse Tester'
  })

  await page.goto('/')
  await addVirtualAuthenticator(page)

  const firstOptions = await (
    await page.request.post('/auth/enroll/options', { data: { token: rawToken } })
  ).json()
  const credential = await createCredential(page, firstOptions)
  await page.request.post('/auth/enroll/verify', {
    data: { token: rawToken, response: credential }
  })

  const secondOptions = await page.request.post('/auth/enroll/options', {
    data: { token: rawToken }
  })
  expect(secondOptions.status()).toBe(400)
})

test('a user can log out and log back in with the same passkey', async ({ page }) => {
  const { rawToken } = await seedEnrollment({
    email: `login-${Date.now()}@example.com`,
    displayName: 'Login Tester'
  })

  await page.goto('/')
  await addVirtualAuthenticator(page)

  const enrollOptions = await (
    await page.request.post('/auth/enroll/options', { data: { token: rawToken } })
  ).json()
  const credential = await createCredential(page, enrollOptions)
  await page.request.post('/auth/enroll/verify', {
    data: { token: rawToken, response: credential }
  })

  await page.request.post('/auth/logout')
  expect((await page.request.get('/auth/me')).status()).toBe(401)

  const loginOptions = await (await page.request.post('/auth/login/options')).json()
  const assertion = await getAssertion(page, loginOptions)
  const loginVerify = await page.request.post('/auth/login/verify', {
    data: { response: assertion }
  })
  expect(loginVerify.ok()).toBeTruthy()

  const meResponse = await page.request.get('/auth/me')
  expect(meResponse.ok()).toBeTruthy()
  expect((await meResponse.json()).display_name).toBe('Login Tester')
})
