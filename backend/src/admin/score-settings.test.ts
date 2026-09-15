import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import Fastify from 'fastify'

process.env.JWT_SECRET = 'score-settings-test-secret'
process.env.COOKIE_SECRET = 'score-settings-test-cookie'

const { authPlugin } = await import('../auth/index.js')
const { closeDatabase } = await import('../database.js')
const { registerAdminRoutes } = await import('./index.js')
after(closeDatabase)

test('score settings reads and writes require a session and cannot be cached', async () => {
  const app = Fastify()
  await app.register(authPlugin)
  await registerAdminRoutes(app)
  try {
    for (const method of ['GET', 'PUT'] as const) {
      const response = await app.inject({
        method,
        url: '/api/admin/score-settings',
        ...(method === 'PUT' ? { payload: { components: ['bmi'] } } : {})
      })
      assert.equal(response.statusCode, 401)
      assert.equal(response.headers['cache-control'], 'no-store')
    }
  } finally {
    await app.close()
  }
})

test('invalid component selections are rejected before a database write', async () => {
  const app = Fastify()
  await app.register(authPlugin)
  // Real authorization and persistence are covered by the API integration spec.
  app.verifyJwt = async (request) => {
    request.user = { sub: 'test-admin', role: 'admin' }
  }
  await registerAdminRoutes(app)
  try {
    for (const payload of [
      {},
      { components: [] },
      { components: ['unknown'] },
      { components: ['bmi', 'bmi'] },
      { components: ['bmi', null] },
      { components: ['bmi', 1] },
      { components: 'bmi' },
      { components: null },
      { components: ['bmi'], userId: 'someone-else' }
    ]) {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/admin/score-settings',
        payload
      })
      assert.equal(response.statusCode, 400, JSON.stringify(payload))
      assert.equal(response.headers['cache-control'], 'no-store')
    }
  } finally {
    await app.close()
  }
})
