import { once } from 'node:events'
import { createServer } from 'node:http'

import { expect, test } from '@playwright/test'
import Fastify from 'fastify'

import { authPlugin } from '../backend/src/auth/index'
import { config } from '../backend/src/config'
import { closeDatabase, sql } from '../backend/src/database'
import {
  handleWithingsCallback,
  registerWithingsProfileRoutes
} from '../backend/src/integrations/withings/index'

test('profile OAuth binds the browser and user, imports readings, and disconnects only that user', async () => {
  const originalConfig = { ...config }
  const app = Fastify()
  const userIds: string[] = []
  let exchanges = 0
  let failSync = false
  const provider = createServer(async (request, response) => {
    for await (const _chunk of request) {
      /* Consume the form body. */
    }
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/v2/oauth2') {
      exchanges += 1
      response.end(
        JSON.stringify({
          status: 0,
          body: {
            access_token: 'profile-access',
            refresh_token: 'profile-refresh',
            expires_in: 3600,
            userid: '880075001'
          }
        })
      )
    } else if (request.url === '/measure') {
      response.end(
        JSON.stringify(
          failSync
            ? { status: 500 }
            : {
                status: 0,
                body: {
                  more: 0,
                  measuregrps: [
                    {
                      date: Math.floor(Date.now() / 1000),
                      grpid: 880075001,
                      measures: [{ type: 1, unit: -1, value: 812 }]
                    }
                  ]
                }
              }
        )
      )
    } else {
      response.statusCode = 404
      response.end('{}')
    }
  })
  try {
    provider.listen(0, '127.0.0.1')
    await once(provider, 'listening')
    const address = provider.address()
    if (!address || typeof address === 'string') {
      throw new Error('Missing mock provider port')
    }
    Object.assign(config, {
      withingsClientId: 'profile-client',
      withingsClientSecret: 'profile-secret',
      withingsApiBaseUrl: `http://127.0.0.1:${address.port}`,
      withingsAuthorizeUrl: 'https://withings.example/authorize',
      withingsRedirectUri: 'http://localhost/integrations/withings/callback',
      withingsWebhookCallbackUrl: undefined,
      withingsBootstrapEmail: undefined,
      withingsBootstrapDisplayName: undefined,
      withingsConnectToken: undefined
    })
    await app.register(authPlugin)
    await registerWithingsProfileRoutes(app)
    app.get('/integrations/withings/callback', handleWithingsCallback)
    const users = await sql<{ id: string }[]>`
      INSERT INTO users (email, display_name, role) VALUES
        ('profile-one@example.com', 'Profile One', 'member'),
        ('profile-two@example.com', 'Profile Two', 'member') RETURNING id
    `
    userIds.push(...users.map((user) => user.id))
    const session = app.jwt.sign({ sub: users[0].id, role: 'member' })
    const otherSession = app.jwt.sign({ sub: users[1].id, role: 'member' })
    await sql`INSERT INTO integration_connection (user_id, provider, access_token, status)
      VALUES (${users[1].id}, 'withings', 'other-access', 'active')`

    for (const [method, url] of [
      ['GET', '/api/integrations/withings/status'],
      ['GET', '/api/integrations/withings/connect'],
      ['DELETE', '/api/integrations/withings']
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401)
    }
    const status = await app.inject({
      url: '/api/integrations/withings/status',
      cookies: { session }
    })
    expect(status.json()).toEqual({ connected: false, configured: true, automaticUpdates: false })
    expect(status.headers['cache-control']).toBe('no-store')
    const connect = await app.inject({
      url: '/api/integrations/withings/connect',
      cookies: { session }
    })
    expect(connect.statusCode).toBe(302)
    const authorization = new URL(connect.headers.location!)
    expect(authorization.searchParams.get('scope')).toBe('user.metrics')
    const state = authorization.searchParams.get('state')!
    const oauthCookie = connect.cookies.find((cookie) => cookie.name === 'r2_withings_state')!
    expect(oauthCookie.httpOnly).toBe(true)
    const callback = `/integrations/withings/callback?code=test-code&state=${encodeURIComponent(state)}`
    for (const cookies of [
      { session },
      { session: otherSession, r2_withings_state: state },
      { session, r2_withings_state: 'wrong' }
    ]) {
      const rejected = await app.inject({ url: callback, cookies })
      expect(rejected.headers.location).toBe('/profile?withings=error')
    }
    expect(exchanges).toBe(0)
    const connected = await app.inject({
      url: callback,
      cookies: { session, r2_withings_state: state }
    })
    expect(connected.headers.location).toBe('/profile?withings=connected')
    expect(connected.cookies.find((cookie) => cookie.name === 'r2_withings_state')?.value).toBe('')
    expect(exchanges).toBe(1)
    expect(
      (await app.inject({ url: '/api/integrations/withings/status', cookies: { session } })).json()
        .connected
    ).toBe(true)
    expect(
      await sql`SELECT weight_kg::float8 AS weight FROM measurement WHERE user_id = ${users[0].id}`
    ).toEqual([{ weight: 81.2 }])

    failSync = true
    const retry = await app.inject({
      url: '/api/integrations/withings/connect',
      cookies: { session }
    })
    const retryState = new URL(retry.headers.location!).searchParams.get('state')!
    const partial = await app.inject({
      url: `/integrations/withings/callback?code=retry&state=${encodeURIComponent(retryState)}`,
      cookies: { session, r2_withings_state: retryState }
    })
    expect(partial.headers.location).toBe('/profile?withings=connected&sync=failed')
    const cancelled = await app.inject({
      url: `/integrations/withings/callback?error=access_denied&state=${encodeURIComponent(retryState)}`,
      cookies: { session, r2_withings_state: retryState }
    })
    expect(cancelled.headers.location).toBe('/profile?withings=cancelled')
    const disconnected = await app.inject({
      method: 'DELETE',
      url: '/api/integrations/withings',
      cookies: { session }
    })
    expect(disconnected.statusCode).toBe(204)
    expect(
      await sql`SELECT id FROM integration_connection WHERE user_id = ${users[0].id}`
    ).toHaveLength(0)
    expect(await sql`SELECT id FROM measurement WHERE user_id = ${users[0].id}`).toHaveLength(1)
    expect(
      await sql`SELECT access_token FROM integration_connection WHERE user_id = ${users[1].id}`
    ).toEqual([{ access_token: 'other-access' }])
    expect(
      (await app.inject({ url: '/api/integrations/withings/status', cookies: { session } })).json()
        .connected
    ).toBe(false)
  } finally {
    if (userIds.length) {
      await sql`DELETE FROM users WHERE id IN ${sql(userIds)}`
    }
    await app.close()
    await new Promise<void>((resolve) => provider.close(() => resolve()))
    Object.assign(config, originalConfig)
    await closeDatabase()
  }
})
