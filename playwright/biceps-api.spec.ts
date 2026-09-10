import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'
import Fastify from 'fastify'

import { authPlugin } from '../backend/src/auth/index'
import { config } from '../backend/src/config'
import { closeDatabase, sql } from '../backend/src/database'
import { registerRaceRoutes } from '../backend/src/race/index'

test('manual biceps readings require an active owner and reach the shared race', async () => {
  const app = Fastify()
  const ids = [randomUUID(), randomUUID()]
  const originalIp = config.radiatorAllowedIp
  config.radiatorAllowedIp = '127.0.0.1'
  await app.register(authPlugin)
  await registerRaceRoutes(app)
  const url = '/api/biceps-measurements'
  const cookies = (id: string) => ({ session: app.jwt.sign({ sub: id, role: 'member' }) })
  const payload = { measuredAt: '2026-09-09', circumferenceCm: 36.5 }
  try {
    for (const method of ['GET', 'POST', 'DELETE'] as const) {
      const response = await app.inject({
        method,
        url: method === 'DELETE' ? `${url}/${randomUUID()}` : url,
        ...(method === 'POST' ? { payload } : {})
      })
      expect(response.statusCode).toBe(401)
      expect(response.headers['cache-control']).toBe('no-store')
    }
    for (const id of ids) {
      await sql`INSERT INTO users (id, email, display_name, role)
        VALUES (${id}, ${`${id}@example.com`}, 'Biceps member', 'member')`
    }
    const post = (body: object, id = ids[0]) =>
      app.inject({ method: 'POST', url, cookies: cookies(id), payload: body })
    const get = (id = ids[0]) => app.inject({ url, cookies: cookies(id) })
    for (const invalid of [
      {},
      { ...payload, circumferenceCm: 0 },
      { ...payload, circumferenceCm: 100.1 },
      { ...payload, circumferenceCm: 36.55 },
      { ...payload, circumferenceCm: '36.5' },
      { ...payload, measuredAt: '2026-02-30' },
      { ...payload, measuredAt: '0000-01-01' },
      { ...payload, measuredAt: '2100-01-01' },
      { ...payload, measuredAt: 'not-a-date' },
      { ...payload, userId: ids[1] }
    ]) {
      expect((await post(invalid)).statusCode, JSON.stringify(invalid)).toBe(400)
    }
    const saved = await post(payload)
    expect(saved.statusCode).toBe(201)
    expect(saved.headers['cache-control']).toBe('no-store')
    const reading = saved.json()
    expect(reading).toEqual({ id: expect.any(String), ...payload })
    expect((await get()).json()).toEqual({ measurements: [reading] })
    expect((await get(ids[1])).json()).toEqual({ measurements: [] })
    await sql`INSERT INTO measurement (user_id, weight_kg, measured_at, source)
      VALUES (${ids[0]}, 81, '2026-09-09', 'manual')`
    for (const options of [
      { url: '/api/race', cookies: cookies(ids[0]) },
      { url: '/api/radiator', remoteAddress: '127.0.0.1' }
    ]) {
      const response = await app.inject(options)
      expect(response.statusCode).toBe(200)
      expect(
        response.json().participants.find((person: { id: string }) => person.id === ids[0])
      ).toMatchObject({
        measurements: [{ measuredAt: '2026-09-09T00:00:00.000Z', weightKg: 81 }],
        bicepsMeasurements: [payload]
      })
    }
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `${url}/${reading.id}`,
          cookies: cookies(ids[1])
        })
      ).statusCode
    ).toBe(404)
    expect((await get()).json().measurements).toHaveLength(1)
    await sql`UPDATE users SET disabled_at = now() WHERE id = ${ids[0]}`
    expect((await get()).statusCode).toBe(401)
    expect((await post(payload)).statusCode).toBe(401)
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `${url}/${reading.id}`,
          cookies: cookies(ids[0])
        })
      ).statusCode
    ).toBe(401)
    await sql`UPDATE users SET disabled_at = NULL WHERE id = ${ids[0]}`
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `${url}/${reading.id}`,
          cookies: cookies(ids[0])
        })
      ).statusCode
    ).toBe(204)
    expect((await get()).json()).toEqual({ measurements: [] })
    // Multiple manual entries on the same day are valid.
    expect((await post(payload)).statusCode).toBe(201)
    expect((await post(payload)).statusCode).toBe(201)
    expect((await get()).json().measurements).toHaveLength(2)
  } finally {
    config.radiatorAllowedIp = originalIp
    await app.close()
    await sql`DELETE FROM users WHERE id IN ${sql(ids)}`
    await closeDatabase()
  }
})
