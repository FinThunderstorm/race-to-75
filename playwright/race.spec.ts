import { createHmac, randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'
import postgres from 'postgres'

import { chartBounds, chartWindow, prepareRace } from '../frontend/src/race/prepareRace'

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
  const [person] = prepareRace(
    [
      {
        id: 'one',
        name: 'One',
        measurements: [
          { measuredAt: '2026-09-02T01:00:00.000Z', weightKg: 79 },
          { measuredAt: '2026-09-01T23:00:00.000Z', weightKg: 82 },
          { measuredAt: '2026-09-01T01:00:00.000Z', weightKg: 80 }
        ]
      }
    ],
    new Date('2026-09-03T12:00:00Z')
  )
  expect(person.points).toEqual([
    { date: '2026-09-01', weight: 81, period: 'day' },
    { date: '2026-09-02', weight: 79, period: 'day' }
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
  expect(prepareRace([participant], new Date('2026-09-15T12:00:00Z'))[0].streak).toBe(7)
  expect(
    prepareRace(
      [
        {
          ...participant,
          measurements: [...measurements, { measuredAt: '2026-09-14T00:00:00.000Z', weightKg: 76 }]
        }
      ],
      new Date('2026-09-15T12:00:00Z')
    )[0].streak
  ).toBe(0)
})

test('empty and single-reading participants do not invent changes or personal records', () => {
  const people = prepareRace(
    [
      { id: 'empty', name: 'Empty', measurements: [] },
      {
        id: 'single',
        name: 'Single',
        measurements: [{ measuredAt: '2026-09-01T00:00:00.000Z', weightKg: 145 }]
      }
    ],
    new Date('2026-09-10T12:00:00Z')
  )
  expect(people[0]).toMatchObject({
    startWeight: null,
    points: [],
    change: 0,
    streak: 0,
    personalLow: false
  })
  expect(people[1]).toMatchObject({ change: 0, personalLow: false })
  const bounds = chartBounds(people, new Date('2026-09-10T12:00:00Z'))
  expect(bounds.top).toBe(145.5)
  expect(bounds.bottom).toBe(73)
  expect(bounds.start).toBe(Date.parse('2026-06-10T00:00:00Z'))
  expect(bounds.end).toBe(Date.parse('2026-09-10T00:00:00Z'))
})

test('completed weeks average all weighings while the current week averages each logged day', () => {
  const [person] = prepareRace(
    [
      {
        id: 'one',
        name: 'One',
        measurements: [
          { measuredAt: '2026-08-31T08:00:00Z', weightKg: 90 },
          { measuredAt: '2026-08-31T12:00:00Z', weightKg: 100 },
          { measuredAt: '2026-08-31T20:00:00Z', weightKg: 110 },
          { measuredAt: '2026-09-01T08:00:00Z', weightKg: 70 },
          { measuredAt: '2026-09-07T08:00:00Z', weightKg: 90 },
          { measuredAt: '2026-09-07T12:00:00Z', weightKg: 80 },
          { measuredAt: '2026-09-09T08:00:00Z', weightKg: 82 }
        ]
      }
    ],
    new Date('2026-09-10T12:00:00Z')
  )
  expect(person.points).toEqual([
    { date: '2026-08-31', weight: 92.5, period: 'week' },
    { date: '2026-09-07', weight: 85, period: 'day' },
    { date: '2026-09-09', weight: 82, period: 'day' }
  ])
  expect(person.latest).toEqual({ date: '2026-09-09', weight: 82 })
  expect(person.change).toBe(-3)
})

test('the three-month window excludes older and future weighings and clips the first week', () => {
  const people = prepareRace(
    [
      {
        id: 'one',
        name: 'One',
        measurements: [
          { measuredAt: '2026-06-09T23:59:59Z', weightKg: 200 },
          { measuredAt: '2026-06-10T00:00:00Z', weightKg: 88 },
          { measuredAt: '2026-06-14T23:59:59Z', weightKg: 92 },
          { measuredAt: '2026-09-10T11:00:00Z', weightKg: 80 },
          { measuredAt: '2026-09-10T13:00:00Z', weightKg: 250 },
          { measuredAt: '2026-09-11T08:00:00Z', weightKg: 300 }
        ]
      }
    ],
    new Date('2026-09-10T12:00:00Z')
  )
  expect(people[0].points).toEqual([
    { date: '2026-06-10', weight: 90, period: 'week' },
    { date: '2026-09-10', weight: 80, period: 'day' }
  ])
  expect(people[0].startWeight).toBe(200)
  expect(chartBounds(people).top).toBeLessThan(200)
})

test('Sunday and Monday fall in different UTC weeks, including across a year boundary', () => {
  const participant = {
    id: 'one',
    name: 'One',
    measurements: [
      { measuredAt: '2027-01-03T23:59:59Z', weightKg: 82 },
      { measuredAt: '2027-01-04T00:00:00Z', weightKg: 80 }
    ]
  }
  expect(prepareRace([participant], new Date('2027-01-04T12:00:00Z'))[0].points).toEqual([
    { date: '2026-12-28', weight: 82, period: 'week' },
    { date: '2027-01-04', weight: 80, period: 'day' }
  ])
  expect(prepareRace([participant], new Date('2027-01-11T12:00:00Z'))[0].points).toEqual([
    { date: '2026-12-28', weight: 82, period: 'week' },
    { date: '2027-01-04', weight: 80, period: 'week' }
  ])
})

test('calendar-month boundaries clamp correctly and remain fixed for empty or stale histories', () => {
  expect(chartWindow(new Date('2026-05-31T12:00:00Z')).start).toBe(
    Date.parse('2026-02-28T00:00:00Z')
  )
  expect(chartWindow(new Date('2024-05-31T12:00:00Z')).start).toBe(
    Date.parse('2024-02-29T00:00:00Z')
  )
  expect(chartWindow(new Date('2027-01-31T12:00:00Z')).start).toBe(
    Date.parse('2026-10-31T00:00:00Z')
  )
  const now = new Date('2026-09-10T12:00:00Z')
  const [person] = prepareRace(
    [
      {
        id: 'old',
        name: 'Old',
        measurements: [{ measuredAt: '2020-01-01T00:00:00Z', weightKg: 150 }]
      }
    ],
    now
  )
  expect(person.points).toEqual([])
  expect(person.latest).toEqual({ date: '2020-01-01', weight: 150 })
  const bounds = chartBounds([person], now)
  expect(bounds.start).toBe(Date.parse('2026-06-10T00:00:00Z'))
  expect(bounds.end).toBe(Date.parse('2026-09-10T00:00:00Z'))
  expect(bounds.top).toBeLessThan(150)
})
