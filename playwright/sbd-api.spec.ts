import { randomUUID } from 'node:crypto'

import { test as base, expect } from '@playwright/test'
import Fastify from 'fastify'

import { authPlugin } from '../backend/src/auth/index'
import { config } from '../backend/src/config'
import { closeDatabase, sql } from '../backend/src/database'
import { registerProfileRoutes } from '../backend/src/profile/index'
import { registerRaceRoutes } from '../backend/src/race/index'

const test = base.extend<{}, { sbdWorker: void }>({
  sbdWorker: [
    async ({}, use) => {
      await use()
    },
    { scope: 'worker', auto: true }
  ]
})

test('SBD readings validate inputs, require an active owner and saved sex, and share lift snapshots', async () => {
  const app = Fastify()
  const ids = [randomUUID(), randomUUID()]
  const originalIp = config.radiatorAllowedIp
  config.radiatorAllowedIp = '127.0.0.1'
  await app.register(authPlugin)
  await registerProfileRoutes(app)
  await registerRaceRoutes(app)
  const url = '/api/sbd-measurements'
  const cookies = (id: string) => ({ session: app.jwt.sign({ sub: id, role: 'member' }) })
  const payload = {
    measuredAt: '2026-09-09',
    squatKg: 140.5,
    benchKg: 95,
    deadliftKg: 185,
    bodyweightKg: 81.2
  }
  const post = (body: object, id = ids[0]) =>
    app.inject({ method: 'POST', url, cookies: cookies(id), payload: body })
  const get = (id = ids[0]) => app.inject({ url, cookies: cookies(id) })
  const remove = (readingId: string, id = ids[0]) =>
    app.inject({ method: 'DELETE', url: `${url}/${readingId}`, cookies: cookies(id) })
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
      await sql`INSERT INTO users (id, email, display_name, role) VALUES (${id}, ${`${id}@example.com`}, 'SBD member', 'member')`
    }
    const missingSex = await post(payload)
    expect(missingSex.statusCode).toBe(400)
    expect(missingSex.json().error).toMatch(/sex/i)
    expect(missingSex.headers['cache-control']).toBe('no-store')
    expect((await get()).json()).toEqual({ measurements: [] })
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/profile',
          cookies: cookies(ids[0]),
          payload: { heightCm: null, sex: 'male' }
        })
      ).statusCode
    ).toBe(200)

    const invalid: object[] = [{}, { ...payload, userId: ids[1] }, { ...payload, totalKg: 420.5 }]
    for (const field of ['squatKg', 'benchKg', 'deadliftKg', 'bodyweightKg']) {
      const withoutField = { ...payload }
      delete withoutField[field as keyof typeof withoutField]
      invalid.push(withoutField)
      for (const value of [
        0,
        -1,
        0.01,
        12.34,
        '100',
        true,
        null,
        field === 'bodyweightKg' ? 500.1 : 1000.1
      ]) {
        invalid.push({ ...payload, [field]: value })
      }
    }
    invalid.push({ ...payload, bodyweightKg: 0.9 })
    for (const measuredAt of [
      '2026-02-30',
      '2025-02-29',
      '0000-01-01',
      '9999-12-31',
      '2026-9-09',
      '2026-09-09T00:00:00Z',
      '',
      null
    ]) {
      invalid.push({ ...payload, measuredAt })
    }
    for (const body of invalid) {
      const response = await post(body)
      expect(response.statusCode, JSON.stringify(body)).toBe(400)
      expect(response.headers['cache-control']).toBe('no-store')
    }
    for (const boundary of [
      { measuredAt: '0001-01-01', squatKg: 0.1, benchKg: 0.1, deadliftKg: 0.1, bodyweightKg: 1 },
      {
        measuredAt: new Date().toISOString().slice(0, 10),
        squatKg: 1000,
        benchKg: 1000,
        deadliftKg: 1000,
        bodyweightKg: 500
      },
      { ...payload, measuredAt: '2024-02-29' }
    ]) {
      const response = await post(boundary)
      expect(response.statusCode).toBe(201)
      expect(response.json()).toEqual({ id: expect.any(String), ...boundary })
      expect((await remove(response.json().id)).statusCode).toBe(204)
    }
    const saved = await post(payload)
    expect(saved.statusCode).toBe(201)
    expect(saved.headers['cache-control']).toBe('no-store')
    const reading = saved.json()
    expect(reading).toEqual({ id: expect.any(String), ...payload })
    const own = await get()
    expect(own.json()).toEqual({ measurements: [reading] })
    expect(own.headers['cache-control']).toBe('no-store')
    expect((await get(ids[1])).json()).toEqual({ measurements: [] })
    // Snapshot body weight is independent of later scale measurements.
    await sql`INSERT INTO measurement (user_id, weight_kg, measured_at, source) VALUES (${ids[0]}, 82, '2026-09-10', 'manual')`
    for (const options of [
      { url: '/api/race', cookies: cookies(ids[0]) },
      { url: '/api/radiator', remoteAddress: '127.0.0.1' }
    ]) {
      const response = await app.inject(options)
      expect(response.statusCode).toBe(200)
      const participant = response
        .json()
        .participants.find((person: { id: string }) => person.id === ids[0])
      expect(participant.sex).toBe('male')
      expect(participant.sbdMeasurements).toEqual([payload])
    }
    expect((await remove(reading.id, ids[1])).statusCode).toBe(404)
    expect((await remove('invalid-id')).statusCode).toBe(400)
    expect((await remove(randomUUID())).statusCode).toBe(404)
    expect((await get()).json().measurements).toHaveLength(1)
    for (const id of [randomUUID(), ids[0]]) {
      if (id === ids[0]) {
        await sql`UPDATE users SET disabled_at = now() WHERE id = ${id}`
      }
      for (const response of [
        await get(id),
        await post(payload, id),
        await remove(reading.id, id)
      ]) {
        expect(response.statusCode).toBe(401)
        expect(response.headers['cache-control']).toBe('no-store')
      }
    }
    await sql`UPDATE users SET disabled_at = NULL WHERE id = ${ids[0]}`
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/profile',
          cookies: cookies(ids[0]),
          payload: { heightCm: null, sex: null }
        })
      ).statusCode
    ).toBe(200)
    expect((await post(payload)).statusCode).toBe(400)
    expect((await get()).json()).toEqual({ measurements: [reading] })
    const deleted = await remove(reading.id)
    expect(deleted.statusCode).toBe(204)
    expect(deleted.headers['cache-control']).toBe('no-store')
    expect((await get()).json()).toEqual({ measurements: [] })
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/profile',
          cookies: cookies(ids[0]),
          payload: { heightCm: null, sex: 'female' }
        })
      ).statusCode
    ).toBe(200)
    const first = await post(payload)
    const second = await post(payload)
    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(201)
    expect((await get()).json()).toEqual({ measurements: [second.json(), first.json()] })
    // Direct database writes must obey the same bounds and precision.
    for (const invalid of [
      { ...payload, squatKg: 0 },
      { ...payload, benchKg: 1000.1 },
      { ...payload, deadliftKg: 1.01 },
      { ...payload, bodyweightKg: 0.9 },
      { ...payload, bodyweightKg: 500.1 },
      { ...payload, bodyweightKg: 80.01 },
      { ...payload, measuredAt: '0001-01-01 BC' },
      { ...payload, measuredAt: '9999-12-31' },
      { ...payload, measuredAt: 'infinity' }
    ]) {
      await expect(sql`INSERT INTO sbd_measurement (user_id, measured_at, squat_kg, bench_kg, deadlift_kg, bodyweight_kg)
        VALUES (${ids[0]}, ${invalid.measuredAt}::text::date, ${invalid.squatKg}, ${invalid.benchKg}, ${invalid.deadliftKg}, ${invalid.bodyweightKg})`).rejects.toMatchObject(
        { code: '23514' }
      )
    }
    await expect(sql`UPDATE users SET sex = 'other' WHERE id = ${ids[0]}`).rejects.toMatchObject({
      code: '23514'
    })
  } finally {
    config.radiatorAllowedIp = originalIp
    await app.close()
    await sql`DELETE FROM users WHERE id IN ${sql(ids)}`
    await closeDatabase()
  }
})
