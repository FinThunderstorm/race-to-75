import { randomUUID } from 'node:crypto'

import { test as base, expect } from '@playwright/test'
import Fastify from 'fastify'

import { registerAdminRoutes } from '../backend/src/admin/index'
import { authPlugin } from '../backend/src/auth/index'
import { config } from '../backend/src/config'
import { closeDatabase, sql } from '../backend/src/database'
import { registerRaceRoutes } from '../backend/src/race/index'

// Give this spec its own worker: imported backend modules own a database pool.
const test = base.extend<{}, { scoreSettingsWorker: void }>({
  scoreSettingsWorker: [async ({}, use) => use(), { scope: 'worker', auto: true }]
})
const defaults = ['bmi', 'biceps', 'blood-pressure', 'dots']
const userIds: string[] = []
const originalConfig = { ...config }

async function createApp() {
  const app = Fastify()
  await app.register(authPlugin)
  await registerAdminRoutes(app)
  await registerRaceRoutes(app)
  await app.ready()
  return app
}

test.afterAll(async () => {
  if (userIds.length) {
    await sql`DELETE FROM users WHERE id IN ${sql(userIds)}`
  }
  Object.assign(config, originalConfig)
  await closeDatabase()
})

test('admin selection persists and reaches race and radiator with current authorization', async () => {
  Object.assign(config, { radiatorAllowedIp: '192.0.2.75' })
  const app = await createApp()
  const [admin, member] = await sql`
    INSERT INTO users (email, display_name, role) VALUES
      (${`score-admin-${randomUUID()}@example.com`}, 'Score admin', 'admin'),
      (${`score-member-${randomUUID()}@example.com`}, 'Score member', 'member')
    RETURNING id, role
  `
  userIds.push(admin.id, member.id)
  const cookies = { session: app.jwt.sign({ sub: admin.id, role: 'admin' }) }
  const memberCookies = { session: app.jwt.sign({ sub: member.id, role: 'admin' }) }
  const endpoint = '/api/admin/score-settings'
  const initial = await app.inject({ url: endpoint, cookies })
  const original = initial.statusCode === 200 ? initial.json().components : undefined
  const save = (components: unknown, extra = {}) =>
    app.inject({ method: 'PUT', url: endpoint, cookies, payload: { components }, ...extra })

  try {
    expect(initial.statusCode).toBe(200)
    expect(initial.headers['cache-control']).toBe('no-store')
    expect(initial.json()).toEqual({ components: defaults })

    for (const method of ['GET', 'PUT'] as const) {
      const options = {
        method,
        url: endpoint,
        ...(method === 'PUT' ? { payload: { components: ['bmi'] } } : {})
      }
      expect((await app.inject(options)).statusCode).toBe(401)
      expect((await app.inject({ ...options, cookies: memberCookies })).statusCode).toBe(403)
    }

    for (const payload of [
      {},
      { components: [] },
      { components: ['bmi', 'bmi'] },
      { components: ['weight'] },
      { components: ['bmi', null] },
      { components: 'bmi' },
      { components: ['bmi'], unexpected: true }
    ]) {
      expect(
        (await app.inject({ method: 'PUT', url: endpoint, cookies, payload })).statusCode
      ).toBe(400)
    }
    expect(
      (await save(['bmi'], { headers: { origin: 'https://untrusted.example' } })).statusCode
    ).toBe(403)
    expect((await save(['bmi'], { headers: { 'sec-fetch-site': 'cross-site' } })).statusCode).toBe(
      403
    )
    expect((await app.inject({ url: endpoint, cookies })).json().components).toEqual(defaults)

    const selected = ['biceps', 'blood-pressure']
    const saved = await save(selected, {
      headers: { origin: new URL(config.webauthnOrigin).origin }
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.headers['cache-control']).toBe('no-store')
    expect(saved.json()).toEqual({ components: selected })

    // A new app instance must read the database, with no process-local settings state.
    const restarted = await createApp()
    try {
      expect((await restarted.inject({ url: endpoint, cookies })).json()).toEqual({
        components: selected
      })
      for (const options of [
        { url: '/api/race', cookies },
        { url: '/api/radiator', remoteAddress: '192.0.2.75' }
      ]) {
        const response = await restarted.inject(options)
        expect(response.statusCode).toBe(200)
        expect(response.json().scoreComponents).toEqual(selected)
        expect(response.json().participants).toEqual(expect.any(Array))
        expect(response.headers['cache-control']).toBe('no-store')
      }
    } finally {
      await restarted.close()
    }

    await sql`UPDATE users SET role = 'member' WHERE id = ${admin.id}`
    expect((await save(['dots'])).statusCode).toBe(403)
    await sql`UPDATE users SET role = 'admin', disabled_at = now() WHERE id = ${admin.id}`
    expect((await save(['dots'])).statusCode).toBe(401)
    await sql`UPDATE users SET disabled_at = NULL WHERE id = ${admin.id}`
    expect((await app.inject({ url: endpoint, cookies })).json().components).toEqual(selected)
    expect((await save(['dots'])).json()).toEqual({ components: ['dots'] })
  } finally {
    await sql`UPDATE users SET role = 'admin', disabled_at = NULL WHERE id = ${admin.id}`
    if (original) {
      const restored = await save(original)
      expect(restored.statusCode).toBe(200)
    }
    await app.close()
  }
})
