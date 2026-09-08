import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  EufyAuthError,
  EufyServiceError,
  fetchEufyReadings,
  loginEufy,
  monthBefore
} from './client.js'
import { decryptToken, encryptToken } from './token.js'

const response =
  (body: unknown, status = 200): typeof fetch =>
  async () =>
    Response.json(body, { status })

test('login sends credentials only to Eufy and returns a token and normalized profiles', async () => {
  const account = await loginEufy('test@example.com', 'test-password', async (url, options) => {
    assert.equal(String(url), 'https://api.eufylife.com/v1/user/v2/email/login')
    assert.equal(options?.redirect, 'error')
    assert.equal(JSON.parse(String(options?.body)).password, 'test-password')
    return Response.json({
      res_code: 1,
      access_token: 'token',
      user_id: 123,
      customers: [{ id: 1, nick_name: 'Racer' }, { id: '2' }]
    })
  })
  assert.equal(account.accountId, '123')
  assert.deepEqual(account.profiles, [
    { id: '1', name: 'Racer' },
    { id: '2', name: 'Profile 2' }
  ])
  assert.equal('password' in account, false)
  assert.equal('email' in account, false)
})

test('upstream errors cannot echo credentials, and expired tokens differ from service failures', async () => {
  await assert.rejects(
    loginEufy('email', 'password', response({ res_code: -1, message: 'secret password' })),
    EufyAuthError
  )
  const get = (fetcher: typeof fetch) =>
    fetchEufyReadings('a', 'token', 'p', new Date(0), new Date(), fetcher)
  await assert.rejects(get(response({ message: 'token' }, 401)), EufyAuthError)
  await assert.rejects(get(response({ message: 'token' }, 503)), EufyServiceError)
  await assert.rejects(get(response({ res_code: 1, unexpected: [] })), EufyServiceError)
})

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
    assert.equal(new URL(String(url)).searchParams.get('after'), String(time - 1))
    assert.equal(new Headers(options?.headers).get('Token'), 'token')
    return Response.json({ res_code: 1, data: records })
  })
  assert.equal(readings.length, 1)
  assert.equal(readings[0].weightKg, 80.5)
  assert.equal(readings[0].measuredAt.toISOString(), from.toISOString())
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
  assert.equal(corrected[0].externalId, readings[0].externalId)
  assert.equal(corrected[0].weightKg, 80)
  const anotherAccount = await fetchEufyReadings(
    'b',
    'token',
    'p',
    from,
    until,
    response({ res_code: 1, data: [record] })
  )
  assert.notEqual(anotherAccount[0].externalId, readings[0].externalId)
})

test('one month back clamps month ends and preserves UTC time', () => {
  assert.equal(
    monthBefore(new Date('2026-03-31T12:34:56Z')).toISOString(),
    '2026-02-28T12:34:56.000Z'
  )
  assert.equal(
    monthBefore(new Date('2024-03-31T12:34:56Z')).toISOString(),
    '2024-02-29T12:34:56.000Z'
  )
  assert.equal(
    monthBefore(new Date('2026-01-08T12:34:56Z')).toISOString(),
    '2025-12-08T12:34:56.000Z'
  )
})

test('encrypted tokens are randomized and cannot be used by another user or after key rotation', () => {
  const encrypted = encryptToken('private-token', 'user', 'secret')
  assert.equal(decryptToken(encrypted, 'user', 'secret'), 'private-token')
  assert.notEqual(encrypted, encryptToken('private-token', 'user', 'secret'))
  assert.throws(() => decryptToken(encrypted, 'other', 'secret'))
  assert.throws(() => decryptToken(encrypted, 'user', 'rotated'))
  assert.throws(() =>
    decryptToken(`${encrypted.slice(0, 5)}X${encrypted.slice(6)}`, 'user', 'secret')
  )
})
