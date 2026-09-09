import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

import fastifyStatic from '@fastify/static'
import { test as base, expect } from '@playwright/test'
import Fastify from 'fastify'

import { registerAdminRoutes } from '../backend/src/admin/index'
import { authPlugin } from '../backend/src/auth/index'
import { config } from '../backend/src/config'
import { closeDatabase, sql } from '../backend/src/database'
import { registerWithingsProfileRoutes } from '../backend/src/integrations/withings/index'
import { registerRaceRoutes } from '../backend/src/race/index'
import { seedEnrollment } from './auth-helpers'
import { addVirtualAuthenticator } from './webauthn'

const app = Fastify()
const originalConfig = { ...config }
let baseURL: string
let userId: string

// Isolate the backend pool/configuration from other specs that own those modules.
const test = base.extend<{}, { radiatorWorker: void }>({
  radiatorWorker: [
    async ({}, use) => {
      await use()
    },
    { scope: 'worker', auto: true }
  ]
})
test.use({
  baseURL: async ({}, use) => {
    await use(baseURL)
  }
})

test.beforeAll(async () => {
  config.radiatorAllowedIp = '127.0.0.1'
  await app.register(authPlugin)
  await registerRaceRoutes(app)
  await registerAdminRoutes(app)
  await registerWithingsProfileRoutes(app)
  await app.register(fastifyStatic, { root: resolve(__dirname, '../frontend/dist') })
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api')) {
      return reply.sendFile('index.html')
    }
    return reply.code(404).send({ error: 'Not found' })
  })
  baseURL = (await app.listen({ port: 0, host: '127.0.0.1' })).replace('127.0.0.1', 'localhost')
  Object.assign(config, { webauthnOrigin: baseURL, webauthnRpId: 'localhost', cookieSecure: false })
})

test.afterAll(async () => {
  if (userId) {
    await sql`DELETE FROM users WHERE id = ${userId}`
  }
  await app.close()
  Object.assign(config, originalConfig)
  await closeDatabase()
})

test('allowed network can view real data, enroll, log out and log back in with a passkey', async ({
  page
}) => {
  const enrollment = await seedEnrollment({
    email: `radiator-${randomUUID()}@example.com`,
    displayName: 'Radiator Login Tester'
  })
  userId = enrollment.userId
  const response = await page.request.get('/api/radiator')
  expect(response.status()).toBe(200)
  expect((await response.json()).participants).toContainEqual({
    id: userId,
    name: 'Radiator Login Tester',
    heightCm: null,
    measurements: []
  })
  for (const path of [
    '/api/race',
    '/api/auth/me',
    '/api/admin/users',
    '/api/integrations/withings/status'
  ]) {
    expect((await page.request.get(path)).status()).toBe(401)
  }
  await page.goto('/')
  await expect(page.locator('.dashboard--radiator')).toBeVisible()
  await expect(page.locator('.dashboard-footer')).toHaveText('Full screen')
  await addVirtualAuthenticator(page)
  await page.goto(`/enroll?token=${enrollment.rawToken}`)
  await page.getByRole('button', { name: 'Create passkey' }).click()
  await expect(page.getByRole('link', { name: 'Radiator Login Tester' })).toBeVisible()
  await expect(page.locator('.dashboard--radiator')).toHaveCount(0)
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('button', { name: 'Log in with passkey' })).toBeVisible()
  await page.goto('/')
  await expect(page.locator('.dashboard--radiator')).toBeVisible()
  await page.goto('/login')
  await page.getByRole('button', { name: 'Log in with passkey' }).click()
  await expect(page.getByRole('link', { name: 'Radiator Login Tester' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
  expect((await page.request.get('/api/race')).status()).toBe(200)
  await page.getByRole('link', { name: 'Radiator Login Tester' }).click()
  await expect(page).toHaveURL(/\/settings$/)
})
