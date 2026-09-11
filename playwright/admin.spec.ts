import { execFile } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import fastifyStatic from '@fastify/static'
import { type BrowserContext, test as base, expect } from '@playwright/test'
import Fastify from 'fastify'

import { registerAdminRoutes } from '../backend/src/admin/index'
import { authPlugin } from '../backend/src/auth/index'
import { config } from '../backend/src/config'
import { closeDatabase, sql } from '../backend/src/database'
import { registerWithingsProfileRoutes } from '../backend/src/integrations/withings/index'
import { registerRaceRoutes } from '../backend/src/race/index'
import { addVirtualAuthenticator, createCredential, getAssertion } from './webauthn'

const prefix = `admin-test-${randomUUID()}`
const userIds: string[] = []
const app = Fastify()
const originalConfig = { ...config }
let baseURL: string

// Backend modules own a database pool and configuration; do not share this worker
// with other specs that also start/stop those modules.
const test = base.extend<{}, { adminWorker: void }>({
  adminWorker: [
    async ({}, use) => {
      await use()
    },
    { scope: 'worker', auto: true }
  ]
})

// Exercise the real routes and built UI with an independent auth rate-limit budget.
test.use({
  baseURL: async ({}, use) => {
    await use(baseURL)
  }
})
test.beforeAll(async () => {
  const frontendDist = resolve(__dirname, '../frontend/dist')
  if (!existsSync(resolve(frontendDist, 'index.html'))) {
    await promisify(execFile)('npm', ['run', 'build', '-w', 'frontend'], {
      cwd: resolve(__dirname, '..')
    })
  }
  await app.register(authPlugin)
  await registerAdminRoutes(app)
  await registerRaceRoutes(app)
  await registerWithingsProfileRoutes(app)
  await app.register(fastifyStatic, { root: frontendDist })
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api')) {
      return reply.sendFile('index.html')
    }
    return reply.code(404).send({ error: 'Not found' })
  })
  baseURL = (await app.listen({ port: 0, host: '127.0.0.1' })).replace('127.0.0.1', 'localhost')
  Object.assign(config, { webauthnOrigin: baseURL, webauthnRpId: 'localhost', cookieSecure: false })
})

async function seed(role: 'admin' | 'member' = 'admin') {
  const [user] = await sql`
    INSERT INTO users (email, display_name, role)
    VALUES (${`${prefix}-${randomUUID()}@example.com`}, 'Admin Test', ${role})
    RETURNING id, email
  `
  userIds.push(user.id)
  return { id: user.id as string, email: user.email as string, role }
}

async function signIn(context: BrowserContext, user: { id: string; role: string }) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({ sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString('base64url')
  const signature = createHmac('sha256', process.env.JWT_SECRET ?? 'race-to-75-test-development')
    .update(`${header}.${payload}`)
    .digest('base64url')
  await context.addCookies([
    { name: 'session', value: `${header}.${payload}.${signature}`, url: baseURL, httpOnly: true }
  ])
}

test.afterAll(async () => {
  await sql`DELETE FROM users WHERE id IN ${sql(userIds)} OR email LIKE ${`${prefix}%`}`
  await app.close()
  Object.assign(config, originalConfig)
  await closeDatabase()
})

test('management endpoints reject anonymous users and members, including forged role claims', async ({
  context,
  request
}) => {
  expect((await request.get('/api/admin/users')).status()).toBe(401)
  const member = await seed('member')
  await signIn(context, { ...member, role: 'admin' })
  for (const response of [
    await context.request.get('/api/admin/users'),
    await context.request.post('/api/admin/users', {
      data: { email: 'forbidden@example.com', display_name: 'Forbidden' }
    }),
    await context.request.patch(`/api/admin/users/${member.id}`, { data: { role: 'admin' } }),
    await context.request.post(`/api/admin/users/${member.id}/enrollment`)
  ]) {
    expect(response.status()).toBe(403)
  }
})

test('admin invites, edits, reissues links, and rejects invalid input and unsafe origins', async ({
  context
}) => {
  await signIn(context, await seed())
  const email = `${prefix}-invite@example.com`
  const invited = await context.request.post('/api/admin/users', {
    data: { email, display_name: 'Invited Member' }
  })
  expect(invited.status()).toBe(201)
  const invitation = await invited.json()
  userIds.push(invitation.user.id)
  expect(invitation.user.role).toBe('member')
  expect(new URL(invitation.enrollmentUrl).origin).toBe(baseURL)
  expect(Date.parse(invitation.expiresAt)).toBeGreaterThan(Date.now())
  const token = new URL(invitation.enrollmentUrl).searchParams.get('token')
  expect(
    (await context.request.post('/api/auth/enroll/options', { data: { token } })).status()
  ).toBe(200)
  const listResponse = await context.request.get('/api/admin/users')
  expect(listResponse.headers()['cache-control']).toBe('no-store')
  expect(await listResponse.text()).not.toContain(token)
  const reissued = await context.request.post(`/api/admin/users/${invitation.user.id}/enrollment`)
  expect(reissued.status()).toBe(201)
  expect((await reissued.json()).enrollmentUrl).not.toBe(invitation.enrollmentUrl)
  expect(
    (await context.request.post('/api/auth/enroll/options', { data: { token } })).status()
  ).toBe(400)

  expect(
    (
      await context.request.patch(`/api/admin/users/${invitation.user.id}`, {
        data: { display_name: 'Renamed Member', email: `${prefix}-renamed@example.com` }
      })
    ).status()
  ).toBe(200)
  expect(
    (
      await context.request.post('/api/admin/users', {
        data: { email: `${prefix}-RENAMED@example.com`, display_name: 'Duplicate' }
      })
    ).status()
  ).toBe(409)
  for (const data of [
    { email: 'invalid', display_name: 'Name' },
    { email: `${prefix}-blank@example.com`, display_name: '  ' },
    { email, display_name: 'Admin injection', role: 'admin' }
  ]) {
    expect((await context.request.post('/api/admin/users', { data })).status()).toBe(400)
  }
  expect(
    (
      await context.request.patch(`/api/admin/users/${invitation.user.id}`, {
        data: { role: 'owner' }
      })
    ).status()
  ).toBe(400)
  expect(
    (
      await context.request.patch('/api/admin/users/not-a-uuid', { data: { role: 'admin' } })
    ).status()
  ).toBe(400)
  expect(
    (
      await context.request.patch(`/api/admin/users/${randomUUID()}`, { data: { role: 'admin' } })
    ).status()
  ).toBe(404)
  expect(
    (
      await context.request.patch(`/api/admin/users/${randomUUID()}`, {
        data: { email: `${prefix}-renamed@example.com` }
      })
    ).status()
  ).toBe(404)
  expect(
    (
      await context.request.post('/api/admin/users', {
        headers: { origin: 'https://untrusted.example' },
        data: { email: `${prefix}-csrf@example.com`, display_name: 'CSRF' }
      })
    ).status()
  ).toBe(403)
})

test('role and enabled-state changes affect existing sessions and protect the acting admin', async ({
  browser,
  context
}) => {
  const admin = await seed()
  const member = await seed('member')
  await signIn(context, admin)
  const memberContext = await browser.newContext({ baseURL })
  try {
    await signIn(memberContext, member)
    const update = (data: object) =>
      context.request.patch(`/api/admin/users/${member.id}`, { data })
    expect((await update({ role: 'admin' })).status()).toBe(200)
    expect((await memberContext.request.get('/api/admin/users')).status()).toBe(200)
    expect((await update({ role: 'member' })).status()).toBe(200)
    expect((await memberContext.request.get('/api/admin/users')).status()).toBe(403)
    expect((await update({ disabled: true })).status()).toBe(200)
    for (const path of ['/api/auth/me', '/api/race', '/api/integrations/withings/status']) {
      expect((await memberContext.request.get(path)).status()).toBe(401)
    }
    expect((await context.request.post(`/api/admin/users/${member.id}/enrollment`)).status()).toBe(
      409
    )
    expect((await update({ disabled: false })).status()).toBe(200)
    expect((await memberContext.request.get('/api/auth/me')).status()).toBe(200)
    for (const data of [{ role: 'member' }, { disabled: true }]) {
      expect((await context.request.patch(`/api/admin/users/${admin.id}`, { data })).status()).toBe(
        409
      )
    }
  } finally {
    await memberContext.close()
  }
})

test('concurrent demotions and duplicate invitations are serialized', async ({
  browser,
  context
}) => {
  const first = await seed()
  const second = await seed()
  await signIn(context, first)
  const otherContext = await browser.newContext({ baseURL })
  try {
    await signIn(otherContext, second)
    const responses = await Promise.all([
      context.request.patch(`/api/admin/users/${second.id}`, { data: { role: 'member' } }),
      otherContext.request.patch(`/api/admin/users/${first.id}`, { data: { role: 'member' } })
    ])
    expect(responses.map((response) => response.status()).sort()).toEqual([200, 403])
    const activeContext = responses[0].status() === 200 ? context : otherContext
    const duplicates = await Promise.all(
      ['duplicate', 'DUPLICATE'].map((suffix) =>
        activeContext.request.post('/api/admin/users', {
          data: { email: `${prefix}-${suffix}@example.com`, display_name: 'Duplicate' }
        })
      )
    )
    expect(duplicates.map((response) => response.status()).sort()).toEqual([201, 409])
  } finally {
    await otherContext.close()
  }
})

test('admin UI invites a member who enrolls and gains management access after promotion', async ({
  page,
  context,
  browser
}) => {
  await signIn(context, await seed())
  await page.goto('/')
  await expect(page.locator('.dashboard-footer').getByRole('link')).toHaveCount(1)
  await page.getByRole('link', { name: 'Admin Test', exact: true }).click()
  await expect(page).toHaveURL(`${baseURL}/settings?mode=bmi`)
  await expect(page.getByRole('heading', { name: 'Asetukset', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Withings', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Käyttäjähallinta', exact: true })).toBeVisible()
  const email = `${prefix}-ui@example.com`
  const form = page.getByRole('form', { name: 'Kutsu käyttäjä' })
  await form.getByLabel('Näyttönimi').fill('UI Invitee')
  await form.getByLabel('Sähköposti').fill(email)
  await form.getByRole('button', { name: 'Luo kutsu' }).click()
  const enrollmentUrl = await page
    .getByRole('textbox', { name: 'Rekisteröitymislinkki', exact: true })
    .inputValue()
  const memberContext = await browser.newContext({ baseURL })
  const memberPage = await memberContext.newPage()
  try {
    await memberPage.goto('/')
    await addVirtualAuthenticator(memberPage)
    await memberPage.goto(enrollmentUrl)
    await memberPage.getByRole('button', { name: 'Luo pääsyavain' }).click()
    await expect(memberPage.getByText('Kirjautuneena UI Invitee')).toBeVisible()
    await expect(memberPage.getByRole('link', { name: 'Käyttäjähallinta' })).toHaveCount(0)
    await memberPage.goto('/settings')
    await expect(memberPage).toHaveURL(`${baseURL}/settings`)
    await expect(
      memberPage.getByRole('heading', { name: 'Käyttäjähallinta', exact: true })
    ).toHaveCount(0)
    await expect(memberPage.getByRole('heading', { name: 'Withings', exact: true })).toBeVisible()
    const card = page.getByRole('article').filter({ hasText: email })
    page.on('dialog', (dialog) => dialog.accept())
    await card.getByRole('button', { name: 'Tee ylläpitäjäksi' }).click()
    await expect(card.getByText('Ylläpitäjä', { exact: true })).toBeVisible()
    await memberPage.goto('/settings')
    await expect(
      memberPage.getByRole('heading', { name: 'Käyttäjähallinta', exact: true })
    ).toBeVisible()
    await card.getByRole('button', { name: 'Muokkaa tietoja' }).click()
    await card.getByLabel('Näyttönimi').fill('Updated Invitee')
    await card.getByRole('button', { name: 'Tallenna muutokset' }).click()
    await expect(card.getByRole('heading', { name: 'Updated Invitee' })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: 'test-results/settings-admin-mobile.png' })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: 'test-results/settings-admin-desktop.png' })
    await card.getByRole('button', { name: 'Muuta osallistujaksi' }).click()
    await expect(card.getByText('Osallistuja', { exact: true })).toBeVisible()
    // Refetch from the open admin view: revoked data and invite controls must disappear.
    await memberPage.getByRole('button', { name: 'Päivitä käyttäjät' }).click()
    await expect(memberPage).toHaveURL(`${baseURL}/settings`)
    await expect(
      memberPage.getByRole('heading', { name: 'Käyttäjähallinta', exact: true })
    ).toHaveCount(0)
    await expect(memberPage.getByRole('heading', { name: 'Withings', exact: true })).toBeVisible()
    await card.getByRole('button', { name: 'Poista tili käytöstä' }).click()
    await expect(card.getByText('Poistettu käytöstä', { exact: true })).toBeVisible()
    await card.getByRole('button', { name: 'Ota tili käyttöön' }).click()
    await expect(card.getByText('Rekisteröitynyt', { exact: true })).toBeVisible()
  } finally {
    await memberContext.close()
  }
})

test('disabled accounts cannot enroll or log in, and expired invitations are rejected', async ({
  page,
  context,
  browser
}) => {
  const admin = await seed()
  await signIn(context, admin)
  const response = await context.request.post('/api/admin/users', {
    data: { email: `${prefix}-disabled@example.com`, display_name: 'Disabled Tester' }
  })
  expect(response.status()).toBe(201)
  const invitation = await response.json()
  userIds.push(invitation.user.id)
  const token = new URL(invitation.enrollmentUrl).searchParams.get('token')
  await page.goto('/')
  await addVirtualAuthenticator(page)
  const options = await (
    await page.request.post('/api/auth/enroll/options', { data: { token } })
  ).json()
  const credential = await createCredential(page, options)
  expect(
    (
      await page.request.post('/api/auth/enroll/verify', { data: { token, response: credential } })
    ).status()
  ).toBe(200)
  // Preserve this member's passkey, then restore the admin session for management.
  await signIn(context, admin)
  const expiredLink = await (
    await context.request.post(`/api/admin/users/${invitation.user.id}/enrollment`)
  ).json()
  const expiredToken = new URL(expiredLink.enrollmentUrl).searchParams.get('token')
  await sql`UPDATE enrollment_token SET expires_at = now() - interval '1 second' WHERE user_id = ${invitation.user.id}`
  expect(
    (
      await page.request.post('/api/auth/enroll/options', { data: { token: expiredToken } })
    ).status()
  ).toBe(400)
  const freshLink = await (
    await context.request.post(`/api/admin/users/${invitation.user.id}/enrollment`)
  ).json()
  const freshToken = new URL(freshLink.enrollmentUrl).searchParams.get('token')
  const freshOptionsResponse = await page.request.post('/api/auth/enroll/options', {
    data: { token: freshToken }
  })
  expect(freshOptionsResponse.status()).toBe(200)
  // A recovery link is normally used on a new device; the existing device is
  // correctly excluded by the registration options.
  const newDevice = await browser.newContext({ baseURL })
  let freshCredential: Awaited<ReturnType<typeof createCredential>>
  try {
    const devicePage = await newDevice.newPage()
    await devicePage.goto('/')
    await addVirtualAuthenticator(devicePage)
    freshCredential = await createCredential(devicePage, await freshOptionsResponse.json())
  } finally {
    await newDevice.close()
  }
  await context.request.patch(`/api/admin/users/${invitation.user.id}`, {
    data: { disabled: true }
  })
  expect(
    (await page.request.post('/api/auth/enroll/options', { data: { token: freshToken } })).status()
  ).toBe(400)
  expect(
    (
      await page.request.post('/api/auth/enroll/verify', {
        data: { token: freshToken, response: freshCredential }
      })
    ).status()
  ).toBe(400)
  await context.request.patch(`/api/admin/users/${invitation.user.id}`, {
    data: { disabled: false }
  })
  expect(
    (await page.request.post('/api/auth/enroll/options', { data: { token: freshToken } })).status()
  ).toBe(400)
  await context.request.patch(`/api/admin/users/${invitation.user.id}`, {
    data: { disabled: true }
  })
  await context.clearCookies()
  const loginOptions = await (await page.request.post('/api/auth/login/options')).json()
  // Explicitly select the registered passkey to prove disablement rejects it.
  loginOptions.allowCredentials = [{ id: credential.id, type: 'public-key' }]
  const assertion = await getAssertion(page, loginOptions)
  expect(assertion.id).toBe(credential.id)
  expect(
    (await page.request.post('/api/auth/login/verify', { data: { response: assertion } })).status()
  ).toBe(400)
})
