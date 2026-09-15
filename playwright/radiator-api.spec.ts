import { test as base, expect } from '@playwright/test'
import Fastify from 'fastify'

// Own the backend module cache and pool without connecting to a database.
const test = base.extend<{}, { radiatorWorker: void }>({
  radiatorWorker: [
    async ({}, use) => {
      const originalEnv = { ...process.env }
      Object.assign(process.env, {
        JWT_SECRET: 'radiator-test-secret-value',
        COOKIE_SECRET: 'radiator-test-cookie-value'
      })
      try {
        await use()
      } finally {
        try {
          const { closeDatabase } = require('../backend/src/database')
          await closeDatabase()
        } finally {
          for (const key of ['JWT_SECRET', 'COOKIE_SECRET']) {
            if (originalEnv[key] === undefined) {
              delete process.env[key]
            } else {
              process.env[key] = originalEnv[key]
            }
          }
        }
      }
    },
    { scope: 'worker', auto: true }
  ]
})

async function createApp(allowedIp = '192.0.2.75', trustProxy = ['10.20.0.0/24']) {
  const { authPlugin } = require('../backend/src/auth/index')
  const { registerRadiatorRoutes } = require('../backend/src/race/radiator')
  const app = Fastify({ trustProxy })
  await app.register(authPlugin)
  registerRadiatorRoutes(app, async () => ({ participants: [] }), allowedIp)
  return app
}

test('configured address reads the radiator without becoming a user or receiving a session', async () => {
  const app = await createApp()
  try {
    const response = await app.inject({ url: '/api/radiator', remoteAddress: '192.0.2.75' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ participants: [] })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['set-cookie']).toBe(undefined)
    expect(
      (await app.inject({ url: '/api/auth/me', remoteAddress: '192.0.2.75' })).statusCode
    ).toBe(401)
    expect(
      (await app.inject({ method: 'POST', url: '/api/radiator', remoteAddress: '192.0.2.75' }))
        .statusCode
    ).toBe(404)
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login/options',
      remoteAddress: '192.0.2.75'
    })
    expect(login.statusCode).toBe(200)
    expect(login.json().challenge).toBeTruthy()
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
      expect(response.statusCode).toBe(401)
      expect(response.headers['cache-control']).toBe('no-store')
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
      expect((await app.inject({ url: '/api/radiator', ...options })).statusCode).toBe(200)
    }
  } finally {
    await app.close()
  }
})

test('accepts equivalent IPv6 spellings and rejects a neighboring IPv6 address', async () => {
  const app = await createApp('2001:db8::75')
  try {
    expect(
      (await app.inject({ url: '/api/radiator', remoteAddress: '2001:0db8:0:0:0:0:0:75' }))
        .statusCode
    ).toBe(200)
    expect(
      (await app.inject({ url: '/api/radiator', remoteAddress: '2001:db8::76' })).statusCode
    ).toBe(401)
  } finally {
    await app.close()
  }
})

test('empty allowed IP disables access, and empty trust configuration ignores forwarded headers', async () => {
  for (const app of [await createApp(''), await createApp('192.0.2.75', [])]) {
    try {
      expect(
        (
          await app.inject({
            url: '/api/radiator',
            remoteAddress: '10.20.0.2',
            headers: { 'x-forwarded-for': '192.0.2.75' }
          })
        ).statusCode
      ).toBe(401)
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
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ allowed })
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.headers['set-cookie']).toBe(undefined)
    }
  } finally {
    await app.close()
  }
})
