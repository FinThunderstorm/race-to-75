import { randomUUID } from 'node:crypto'

import { test as base, expect } from '@playwright/test'
import Fastify from 'fastify'

import { config } from '../backend/src/config'
import { closeDatabase, sql } from '../backend/src/database'
import {
  handleWithingsCallback,
  handleWithingsConnect
} from '../backend/src/integrations/withings/index'

const test = base.extend<{}, { bootstrapWorker: void }>({
  bootstrapWorker: [
    async ({}, use) => {
      await use()
    },
    { scope: 'worker', auto: true }
  ]
})

test('legacy Withings reconnect preserves managed account roles and names', async () => {
  const originalConfig = { ...config }
  const app = Fastify()
  const provider = Fastify()
  const email = `bootstrap-role-${randomUUID()}@example.com`
  let userId: string | undefined
  try {
    provider.post('/v2/oauth2', async () => ({
      status: 0,
      body: {
        access_token: 'test-access',
        refresh_token: 'test-refresh',
        expires_in: 3600,
        userid: '880075002'
      }
    }))
    provider.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_request, body, done) => done(null, body)
    )
    provider.post('/measure', async () => ({ status: 0, body: { more: 0, measuregrps: [] } }))
    const providerUrl = await provider.listen({ port: 0, host: '127.0.0.1' })
    Object.assign(config, {
      withingsClientId: 'bootstrap-client',
      withingsClientSecret: 'bootstrap-secret',
      withingsApiBaseUrl: providerUrl,
      withingsAuthorizeUrl: 'https://withings.example/authorize',
      withingsRedirectUri: 'http://localhost/integrations/withings/callback',
      withingsWebhookCallbackUrl: undefined,
      withingsBootstrapEmail: email,
      withingsBootstrapDisplayName: 'Old bootstrap name',
      withingsConnectToken: 'bootstrap-test-connect'
    })
    app.get('/integrations/withings/connect', handleWithingsConnect)
    app.get('/integrations/withings/callback', handleWithingsCallback)
    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (email, display_name, role)
      VALUES (${email}, 'Managed name', 'member') RETURNING id
    `
    userId = user.id
    for (const role of ['member', 'admin'] as const) {
      await sql`UPDATE users SET role = ${role} WHERE id = ${userId}`
      config.withingsBootstrapRole = role === 'admin' ? 'member' : 'admin'
      const connect = await app.inject(
        '/integrations/withings/connect?token=bootstrap-test-connect'
      )
      expect(connect.statusCode).toBe(302)
      const state = new URL(connect.headers.location!).searchParams.get('state')!
      const callback = await app.inject(
        `/integrations/withings/callback?code=test&state=${encodeURIComponent(state)}`
      )
      expect(callback.statusCode).toBe(200)
      expect(await sql`SELECT role, display_name FROM users WHERE id = ${userId}`).toEqual([
        { role, display_name: 'Managed name' }
      ])
    }
  } finally {
    if (userId) {
      await sql`DELETE FROM users WHERE id = ${userId}`
    }
    await app.close()
    await provider.close()
    Object.assign(config, originalConfig)
    await closeDatabase()
  }
})
