import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import Fastify from 'fastify'

process.env.JWT_SECRET = 'profile-test-secret-value'
process.env.COOKIE_SECRET = 'profile-test-cookie-value'

const { authPlugin } = await import('../auth/index.js')
const { closeDatabase } = await import('../database.js')
const { registerProfileRoutes } = await import('./index.js')
after(closeDatabase)

test('profile reads and writes require a session and cannot be cached', async () => {
  const app = Fastify()
  await app.register(authPlugin)
  await registerProfileRoutes(app)
  try {
    for (const method of ['GET', 'PUT'] as const) {
      const response = await app.inject({
        method,
        url: '/api/profile',
        ...(method === 'PUT' ? { payload: { heightCm: 180 } } : {})
      })
      assert.equal(response.statusCode, 401)
      assert.equal(response.headers['cache-control'], 'no-store')
    }
  } finally {
    await app.close()
  }
})

test('invalid profile payloads are rejected before any database write', async () => {
  const app = Fastify()
  await app.register(authPlugin)
  // Authentication itself is exercised above and in the database integration test.
  app.verifyJwt = async () => {}
  await registerProfileRoutes(app)
  try {
    for (const payload of [
      {},
      { heightCm: 49.9 },
      { heightCm: 300.1 },
      { heightCm: 179.99 },
      { heightCm: '180' },
      { heightCm: false },
      { heightCm: 180, userId: 'someone-else' }
    ]) {
      const response = await app.inject({ method: 'PUT', url: '/api/profile', payload })
      assert.equal(response.statusCode, 400, JSON.stringify(payload))
      assert.equal(response.headers['cache-control'], 'no-store')
    }
  } finally {
    await app.close()
  }
})
