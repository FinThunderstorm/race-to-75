import { createHmac, randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'
import postgres from 'postgres'

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/race_to_75'

function sessionCookie(userId: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, role: 'member', exp: Math.floor(Date.now() / 1000) + 300 })
  ).toString('base64url')
  const signature = createHmac('sha256', process.env.JWT_SECRET ?? 'race-to-75-test-development')
    .update(`${header}.${payload}`)
    .digest('base64url')
  return `session=${header}.${payload}.${signature}`
}

test('race history requires authentication', async ({ request }) => {
  expect((await request.get('/api/race')).status()).toBe(401)
})

test('members can read all participants and history from multiple sources without private account fields', async ({
  request
}) => {
  const sql = postgres(databaseUrl)
  const ids = [randomUUID(), randomUUID(), randomUUID()]
  try {
    for (const [index, id] of ids.entries()) {
      await sql`INSERT INTO users (id, email, display_name, role) VALUES (${id}, ${`${id}@example.com`}, ${`Race member ${index}`}, 'member')`
    }
    await sql`INSERT INTO measurement (user_id, weight_kg, measured_at, source, external_id) VALUES
      (${ids[0]}, 120.5, '2010-01-01T08:00:00Z', 'withings', ${randomUUID()}),
      (${ids[0]}, 80.2, '2026-09-01T08:00:00Z', 'withings', ${randomUUID()}),
      (${ids[1]}, 74.1, '2026-09-02T09:00:00Z', 'withings', ${randomUUID()}),
      (${ids[1]}, 50, '2026-09-03T09:00:00Z', 'manual', NULL),
      (${ids[0]}, 79.5, '2026-09-03T08:00:00Z', 'eufy', ${randomUUID()})`

    const headers = { cookie: sessionCookie(ids[0]) }
    const response = await request.get('/api/race', { headers })
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toBe('no-store')
    const { participants } = await response.json()
    expect(participants).toEqual(
      expect.arrayContaining([
        {
          id: ids[0],
          name: 'Race member 0',
          heightCm: null,
          sex: null,
          sbdMeasurements: [],
          bloodPressureMeasurements: [],
          bicepsMeasurements: [],
          measurements: [
            { measuredAt: '2010-01-01T08:00:00.000Z', weightKg: 120.5 },
            { measuredAt: '2026-09-01T08:00:00.000Z', weightKg: 80.2 },
            { measuredAt: '2026-09-03T08:00:00.000Z', weightKg: 79.5 }
          ]
        },
        {
          id: ids[1],
          name: 'Race member 1',
          heightCm: null,
          sex: null,
          sbdMeasurements: [],
          bloodPressureMeasurements: [],
          bicepsMeasurements: [],
          measurements: [
            { measuredAt: '2026-09-02T09:00:00.000Z', weightKg: 74.1 },
            { measuredAt: '2026-09-03T09:00:00.000Z', weightKg: 50 }
          ]
        },
        {
          id: ids[2],
          name: 'Race member 2',
          heightCm: null,
          sex: null,
          sbdMeasurements: [],
          measurements: [],
          bloodPressureMeasurements: [],
          bicepsMeasurements: []
        }
      ])
    )
    for (const participant of participants) {
      expect(Object.keys(participant).sort()).toEqual([
        'bicepsMeasurements',
        'bloodPressureMeasurements',
        'heightCm',
        'id',
        'measurements',
        'name',
        'sbdMeasurements',
        'sex'
      ])
    }
    await sql`DELETE FROM users WHERE id = ${ids[0]}`
    expect((await request.get('/api/race', { headers })).status()).toBe(401)
  } finally {
    await sql`DELETE FROM users WHERE id IN ${sql(ids)}`
    await sql.end()
  }
})
