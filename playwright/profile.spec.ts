import { randomUUID } from 'node:crypto'

import { test as base, expect } from '@playwright/test'
import Fastify from 'fastify'

import { authPlugin } from '../backend/src/auth/index'
import { config } from '../backend/src/config'
import { closeDatabase, sql } from '../backend/src/database'
import { registerProfileRoutes } from '../backend/src/profile/index'
import { registerRaceRoutes } from '../backend/src/race/index'

// Isolate the backend pool and configuration from other specs.
const test = base.extend<{}, { profileWorker: void }>({
  profileWorker: [
    async ({}, use) => {
      await use()
    },
    { scope: 'worker', auto: true }
  ]
})

test('height validates input, persists only for its owner, and reaches race and radiator unchanged', async () => {
  const app = Fastify()
  const ids = [randomUUID(), randomUUID()]
  const originalAllowedIp = config.radiatorAllowedIp
  config.radiatorAllowedIp = '127.0.0.1'
  await app.register(authPlugin)
  await registerProfileRoutes(app)
  await registerRaceRoutes(app)
  const cookies = (id: string) => ({ session: app.jwt.sign({ sub: id, role: 'member' }) })
  const getProfile = (id: string) => app.inject({ url: '/api/profile', cookies: cookies(id) })
  const putProfile = (id: string, payload: object) =>
    app.inject({ method: 'PUT', url: '/api/profile', cookies: cookies(id), payload })

  try {
    for (const [index, id] of ids.entries()) {
      await sql`INSERT INTO users (id, email, display_name, role)
        VALUES (${id}, ${`${id}@example.com`}, ${`Height member ${index}`}, 'member')`
    }
    for (const method of ['GET', 'PUT'] as const) {
      const response = await app.inject({
        method,
        url: '/api/profile',
        ...(method === 'PUT' ? { payload: { heightCm: 180 } } : {})
      })
      expect(response.statusCode).toBe(401)
      expect(response.headers['cache-control']).toBe('no-store')
    }

    const initial = await getProfile(ids[0])
    expect(initial.statusCode).toBe(200)
    expect(initial.json()).toEqual({ heightCm: null })
    expect(initial.headers['cache-control']).toBe('no-store')

    for (const heightCm of [50, 300, 179.9]) {
      const saved = await putProfile(ids[0], { heightCm })
      expect(saved.statusCode).toBe(200)
      expect(saved.json()).toEqual({ heightCm })
      expect(saved.headers['cache-control']).toBe('no-store')
      expect((await getProfile(ids[0])).json()).toEqual({ heightCm })
    }

    for (const payload of [
      {},
      { heightCm: 0 },
      { heightCm: -180 },
      { heightCm: 49.9 },
      { heightCm: 300.1 },
      { heightCm: 179.99 },
      { heightCm: '180' },
      { heightCm: true },
      { heightCm: 180, userId: ids[1] },
      { heightCm: 180, role: 'admin' }
    ]) {
      const invalid = await putProfile(ids[0], payload)
      expect(invalid.statusCode, JSON.stringify(payload)).toBe(400)
      expect(invalid.headers['cache-control']).toBe('no-store')
    }
    expect((await getProfile(ids[0])).json()).toEqual({ heightCm: 179.9 })
    expect((await getProfile(ids[1])).json()).toEqual({ heightCm: null })
    expect((await putProfile(ids[1], { heightCm: 165 })).statusCode).toBe(200)
    expect((await getProfile(ids[0])).json()).toEqual({ heightCm: 179.9 })

    await sql`INSERT INTO measurement (user_id, weight_kg, measured_at, source)
      VALUES (${ids[0]}, 80.25, '2026-09-09T08:00:00Z', 'manual')`
    for (const options of [
      { url: '/api/race', cookies: cookies(ids[0]) },
      { url: '/api/radiator', remoteAddress: '127.0.0.1' }
    ]) {
      const response = await app.inject(options)
      expect(response.statusCode).toBe(200)
      expect(response.json().participants).toContainEqual({
        id: ids[0],
        name: 'Height member 0',
        heightCm: 179.9,
        bicepsMeasurements: [],
        bloodPressureMeasurements: [],
        measurements: [{ measuredAt: '2026-09-09T08:00:00.000Z', weightKg: 80.25 }]
      })
    }

    const cleared = await putProfile(ids[0], { heightCm: null })
    expect(cleared.statusCode).toBe(200)
    expect(cleared.json()).toEqual({ heightCm: null })
    expect((await getProfile(ids[0])).json()).toEqual({ heightCm: null })
    const [stored] = await sql`SELECT height_cm FROM users WHERE id = ${ids[0]}`
    expect(stored.height_cm).toBeNull()
    expect((await getProfile(ids[1])).json()).toEqual({ heightCm: 165 })

    await sql`UPDATE users SET disabled_at = now() WHERE id = ${ids[1]}`
    expect((await getProfile(ids[1])).statusCode).toBe(401)
    expect((await putProfile(ids[1], { heightCm: 180 })).statusCode).toBe(401)
    const [disabled] = await sql`SELECT height_cm::float8 AS height FROM users WHERE id = ${ids[1]}`
    expect(disabled.height).toBe(165)
  } finally {
    config.radiatorAllowedIp = originalAllowedIp
    await app.close()
    await sql`DELETE FROM users WHERE id IN ${sql(ids)}`
    await closeDatabase()
  }
})
