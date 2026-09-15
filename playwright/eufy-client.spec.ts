import { expect, test } from '@playwright/test'

import { fetchEufyReadings, lookbackStart } from '../backend/src/integrations/eufy/client'

const response =
  (body: unknown, status = 200): typeof fetch =>
  async () =>
    Response.json(body, { status })

test('history filters profiles and dates, normalizes kg, and keeps correction IDs stable', async () => {
  const from = new Date('2026-08-08T12:00:00Z')
  const until = new Date('2026-09-08T12:00:00Z')
  const time = from.getTime() / 1000
  const record = {
    customer_id: 'p',
    device_id: 'scale',
    create_time: time,
    update_time: time + 100,
    scale_data: { weight: 805 }
  }
  const records = [
    record,
    { ...record, customer_id: 'other' },
    { ...record, create_time: time - 1 },
    { ...record, create_time: until.getTime() / 1000 + 1 }
  ]
  const readings = await fetchEufyReadings('a', 'token', 'p', from, until, async (url, options) => {
    expect(new URL(String(url)).searchParams.get('after')).toBe(String(time - 1))
    expect(new Headers(options?.headers).get('Token')).toBe('token')
    return Response.json({ res_code: 1, data: records })
  })
  expect(readings.length).toBe(1)
  expect(readings[0].weightKg).toBe(80.5)
  expect(readings[0].measuredAt.toISOString()).toBe(from.toISOString())
  const corrected = await fetchEufyReadings(
    'a',
    'token',
    'p',
    from,
    until,
    response({
      res_code: 1,
      data: [{ ...record, update_time: time + 200, scale_data: { weight: 800 } }]
    })
  )
  expect(corrected[0].externalId).toBe(readings[0].externalId)
  expect(corrected[0].weightKg).toBe(80)
  const anotherAccount = await fetchEufyReadings(
    'b',
    'token',
    'p',
    from,
    until,
    response({ res_code: 1, data: [record] })
  )
  expect(anotherAccount[0].externalId).not.toBe(readings[0].externalId)
})

test('three months back clamps month ends and preserves UTC time', () => {
  expect(lookbackStart(new Date('2026-05-31T12:34:56Z')).toISOString()).toBe(
    '2026-02-28T12:34:56.000Z'
  )
  expect(lookbackStart(new Date('2024-05-31T12:34:56Z')).toISOString()).toBe(
    '2024-02-29T12:34:56.000Z'
  )
  expect(lookbackStart(new Date('2026-01-08T12:34:56Z')).toISOString()).toBe(
    '2025-10-08T12:34:56.000Z'
  )
})
