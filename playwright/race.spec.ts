import { createHmac, randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'
import postgres from 'postgres'

import { chartBounds, prepareRace } from '../frontend/src/race/prepareRace'

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

test('members can read all participants and all imported Withings history, without private account fields', async ({
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
      (${ids[1]}, 50, '2026-09-03T09:00:00Z', 'manual', NULL)`

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
          measurements: [
            { measuredAt: '2010-01-01T08:00:00.000Z', weightKg: 120.5 },
            { measuredAt: '2026-09-01T08:00:00.000Z', weightKg: 80.2 }
          ]
        },
        {
          id: ids[1],
          name: 'Race member 1',
          measurements: [{ measuredAt: '2026-09-02T09:00:00.000Z', weightKg: 74.1 }]
        },
        { id: ids[2], name: 'Race member 2', measurements: [] }
      ])
    )
    for (const participant of participants) {
      expect(Object.keys(participant).sort()).toEqual(['id', 'measurements', 'name'])
    }
    await sql`DELETE FROM users WHERE id = ${ids[0]}`
    expect((await request.get('/api/race', { headers })).status()).toBe(401)
  } finally {
    await sql`DELETE FROM users WHERE id IN ${sql(ids)}`
    await sql.end()
  }
})

test('daily averages use UTC and preserve the first recorded start weight', () => {
  const [person] = prepareRace([
    {
      id: 'one',
      name: 'One',
      measurements: [
        { measuredAt: '2026-09-02T01:00:00.000Z', weightKg: 79 },
        { measuredAt: '2026-09-01T23:00:00.000Z', weightKg: 82 },
        { measuredAt: '2026-09-01T01:00:00.000Z', weightKg: 80 }
      ]
    }
  ])
  expect(person.points).toEqual([
    { date: '2026-09-01', weight: 81 },
    { date: '2026-09-02', weight: 79 }
  ])
  expect(person.startWeight).toBe(80)
  expect(person.change).toBe(-2)
  expect(person.personalLow).toBe(true)
})

test('streaks skip missing days and reset on a daily average above the goal', () => {
  const measurements = Array.from({ length: 7 }, (_, index) => ({
    measuredAt: new Date(Date.UTC(2026, 8, 1 + index * 2)).toISOString(),
    weightKg: 75
  }))
  const participant = { id: 'one', name: 'One', measurements }
  expect(prepareRace([participant])[0].streak).toBe(7)
  expect(
    prepareRace([
      {
        ...participant,
        measurements: [...measurements, { measuredAt: '2026-09-14T00:00:00.000Z', weightKg: 76 }]
      }
    ])[0].streak
  ).toBe(0)
})

test('empty and single-reading participants do not invent changes or personal records', () => {
  const people = prepareRace([
    { id: 'empty', name: 'Empty', measurements: [] },
    {
      id: 'single',
      name: 'Single',
      measurements: [{ measuredAt: '2026-09-01T00:00:00.000Z', weightKg: 145 }]
    }
  ])
  expect(people[0]).toMatchObject({
    startWeight: null,
    points: [],
    change: 0,
    streak: 0,
    personalLow: false
  })
  expect(people[1]).toMatchObject({ change: 0, personalLow: false })
  const bounds = chartBounds(people)
  expect(bounds.top).toBeGreaterThan(145)
  expect(bounds.bottom).toBeLessThan(75)
  expect(bounds.start).toBe(bounds.end)
})
