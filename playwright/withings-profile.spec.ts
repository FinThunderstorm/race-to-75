import { once } from 'node:events'
import { createServer } from 'node:http'

import { expect, test } from './app-fixtures'

test('profile OAuth binds the browser and user, imports readings, and disconnects only that user', async ({
  application,
  page,
  signIn
}) => {
  const { app, sql, config } = application
  const originalConfig = { ...config }
  const userIds: string[] = []
  let exchanges = 0
  let failSync = false
  const provider = createServer(async (request, response) => {
    for await (const _chunk of request) {
      /* Consume the form body. */
    }
    if (request.url?.startsWith('/authorize?')) {
      const authorization = new URL(request.url, 'http://provider')
      expect(authorization.searchParams.get('scope')).toBe('user.metrics')
      const callback = new URL(authorization.searchParams.get('redirect_uri')!)
      callback.searchParams.set('code', 'browser-code')
      callback.searchParams.set('state', authorization.searchParams.get('state')!)
      response.writeHead(302, { location: callback.toString() }).end()
      return
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
      withingsAuthorizeUrl: `http://127.0.0.1:${address.port}/authorize`,
      withingsRedirectUri: `${application.url}/integrations/withings/callback`,
      withingsWebhookCallbackUrl: undefined,
      withingsBootstrapEmail: undefined,
      withingsBootstrapDisplayName: undefined,
      withingsConnectToken: undefined
    })
    const owner = await signIn()
    const [other] = await sql<{ id: string }[]>`
      INSERT INTO users (email, display_name, role) VALUES
        ('profile-two@example.com', 'Profile Two', 'member') RETURNING id
    `
    const users = [owner, other]
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
      expect(rejected.headers.location).toBe('/settings?withings=error')
    }
    expect(exchanges).toBe(0)
    await page.goto('/profile')
    const withings = page.getByRole('region', { name: 'Withings', exact: true })
    await withings.getByRole('link', { name: 'Yhdistä Withings', exact: true }).click()
    await expect(page).toHaveURL(/\/profile\?withings=connected$/)
    await expect(
      withings.getByRole('status').filter({ hasText: /^Withings yhdistetty\.$/ })
    ).toBeVisible()
    await expect(withings.getByRole('status').filter({ hasText: /^Yhdistetty$/ })).toBeVisible()
    expect(
      (await page.context().cookies()).find((cookie) => cookie.name === 'r2_withings_state')
    ).toBeUndefined()
    await page.reload()
    await expect(withings.getByRole('status').filter({ hasText: /^Yhdistetty$/ })).toBeVisible()
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
    expect(partial.headers.location).toBe('/settings?withings=connected&sync=failed')
    await page.goto(`${partial.headers.location}#withings-heading`)
    await expect(page).toHaveURL(/\/profile\?withings=connected&sync=failed#withings-heading$/)
    await expect(withings.getByRole('alert')).toContainText('mittausten tuonti epäonnistui')
    const cancelled = await app.inject({
      url: `/integrations/withings/callback?error=access_denied&state=${encodeURIComponent(retryState)}`,
      cookies: { session, r2_withings_state: retryState }
    })
    expect(cancelled.headers.location).toBe('/settings?withings=cancelled')
    await page.goto(cancelled.headers.location!)
    await expect(
      page.getByText('Yhdistäminen peruutettu. Voit yrittää uudelleen alta.')
    ).toBeVisible()
    await withings.getByRole('button', { name: 'Katkaise Withings-yhteys' }).click()
    await expect(withings.getByRole('status').filter({ hasText: /^Ei yhdistetty$/ })).toBeVisible()
    await page.reload()
    await expect(withings.getByRole('status').filter({ hasText: /^Ei yhdistetty$/ })).toBeVisible()
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
    await new Promise<void>((resolve) => provider.close(() => resolve()))
    Object.assign(config, originalConfig)
  }
})
