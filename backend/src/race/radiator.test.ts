import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import Fastify from 'fastify'

process.env.JWT_SECRET = 'radiator-test-secret-value'
process.env.COOKIE_SECRET = 'radiator-test-cookie-value'
process.env.RADIATOR_ALLOWED_IP = '192.0.2.75'
process.env.TRUST_PROXY = '10.20.0.0/24'

const { config } = await import('../config.js')
const { authPlugin } = await import('../auth/index.js')
const { closeDatabase } = await import('../database.js')
const { registerRadiatorRoutes } = await import('./radiator.js')
after(closeDatabase)

async function createApp(allowedIp = config.radiatorAllowedIp, trustProxy = config.trustProxy) {
  const app = Fastify({ trustProxy })
  await app.register(authPlugin)
  registerRadiatorRoutes(app, async () => ({ participants: [] }), allowedIp)
  return app
}

test('configured address reads the radiator without becoming a user or receiving a session', async () => {
  const app = await createApp()
  try {
    const response = await app.inject({ url: '/api/radiator', remoteAddress: '192.0.2.75' })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { participants: [] })
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.equal(response.headers['set-cookie'], undefined)
    assert.equal(
      (await app.inject({ url: '/api/auth/me', remoteAddress: '192.0.2.75' })).statusCode,
      401
    )
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/radiator', remoteAddress: '192.0.2.75' }))
        .statusCode,
      404
    )
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login/options',
      remoteAddress: '192.0.2.75'
    })
    assert.equal(login.statusCode, 200)
    assert.ok(login.json().challenge)
  } finally {
    await app.close()
  }
})

test('denies other addresses, spoofed forwarding, and forwarding through an untrusted hop', async () => {
  const app = await createApp()
  try {
    for (const options of [
      { remoteAddress: '192.0.2.76' },
      { remoteAddress: '192.0.2.76', headers: { 'x-forwarded-for': '192.0.2.75' } },
      { remoteAddress: '10.20.0.2', headers: { 'x-forwarded-for': '192.0.2.75, 192.0.2.76' } }
    ]) {
      const response = await app.inject({ url: '/api/radiator', ...options })
      assert.equal(response.statusCode, 401)
      assert.equal(response.headers['cache-control'], 'no-store')
    }
  } finally {
    await app.close()
  }
})

test('accepts IPv4-mapped IPv6 and the address forwarded by a trusted proxy', async () => {
  const app = await createApp()
  try {
    for (const options of [
      { remoteAddress: '::ffff:192.0.2.75' },
      { remoteAddress: '10.20.0.2', headers: { 'x-forwarded-for': '192.0.2.75' } }
    ]) {
      assert.equal((await app.inject({ url: '/api/radiator', ...options })).statusCode, 200)
    }
  } finally {
    await app.close()
  }
})

test('accepts equivalent IPv6 spellings and rejects a neighboring IPv6 address', async () => {
  const app = await createApp('2001:db8::75')
  try {
    assert.equal(
      (await app.inject({ url: '/api/radiator', remoteAddress: '2001:0db8:0:0:0:0:0:75' }))
        .statusCode,
      200
    )
    assert.equal(
      (await app.inject({ url: '/api/radiator', remoteAddress: '2001:db8::76' })).statusCode,
      401
    )
  } finally {
    await app.close()
  }
})

test('empty allowed IP disables access, and empty trust configuration ignores forwarded headers', async () => {
  for (const app of [await createApp(''), await createApp('192.0.2.75', [])]) {
    try {
      assert.equal(
        (
          await app.inject({
            url: '/api/radiator',
            remoteAddress: '10.20.0.2',
            headers: { 'x-forwarded-for': '192.0.2.75' }
          })
        ).statusCode,
        401
      )
    } finally {
      await app.close()
    }
  }
})

test('IP status reports the same address decision without requiring a session or exposing race data', async () => {
  const app = await createApp()
  try {
    for (const [remoteAddress, headers, allowed] of [
      ['192.0.2.75', {}, true],
      ['192.0.2.76', {}, false],
      ['192.0.2.76', { 'x-forwarded-for': '192.0.2.75' }, false],
      ['10.20.0.2', { 'x-forwarded-for': '192.0.2.75' }, true]
    ] as const) {
      const response = await app.inject({ url: '/api/radiator/access', remoteAddress, headers })
      assert.equal(response.statusCode, 200)
      assert.deepEqual(response.json(), { allowed })
      assert.equal(response.headers['cache-control'], 'no-store')
      assert.equal(response.headers['set-cookie'], undefined)
    }
  } finally {
    await app.close()
  }
})
