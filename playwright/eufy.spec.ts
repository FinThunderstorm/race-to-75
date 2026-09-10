import { randomUUID } from 'node:crypto'

import { test as base, expect } from '@playwright/test'
import Fastify from 'fastify'

import { authPlugin } from '../backend/src/auth/index'
import { closeDatabase, sql } from '../backend/src/database'
import { registerEufyRoutes } from '../backend/src/integrations/eufy/index'
import { claimSync, finishSync } from '../backend/src/integrations/eufy/queries'
import { syncEufy } from '../backend/src/integrations/eufy/sync'
import { registerRaceRoutes } from '../backend/src/race/index'

// Keep the backend pool and mocked global fetch isolated from other specs.
const test = base.extend<{}, { eufyWorker: void }>({
  eufyWorker: [
    async ({}, use) => {
      await use()
    },
    { scope: 'worker', auto: true }
  ]
})

test('Eufy connection isolates profiles, imports once, survives reconnect, and stops after disconnect', async () => {
  const ids = [randomUUID(), randomUUID()]
  const accountId = randomUUID()
  const logs: string[] = []
  const app = Fastify({
    logger: {
      stream: {
        write: (line: string) => {
          logs.push(line)
        }
      }
    }
  })
  await app.register(authPlugin)
  await registerEufyRoutes(app)
  await registerRaceRoutes(app)
  const cookie = (id: string) => `session=${app.jwt.sign({ sub: id, role: 'member' })}`
  const originalFetch = globalThis.fetch
  let failData = 0
  let dataCalls = 0
  let requestedAfter = 0
  let weight = 805
  let loginCalls = 0
  const timestamp = Math.floor(Date.now() / 1000) - 3600
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input))
    expect(url.origin).toBe('https://api.eufylife.com')
    if (url.pathname.endsWith('/login')) {
      loginCalls++
      const body = JSON.parse(String(options?.body))
      expect(body.email).toBe('eufy@example.com')
      expect(body.password).toBe('never-store-this-password')
      return Response.json({
        res_code: 1,
        access_token: `private-token-${loginCalls}`,
        user_id: accountId,
        expires_in: 2592000,
        customers: [
          { id: 'p1', name: 'One' },
          { id: 'p2', name: 'Two' }
        ]
      })
    }
    expect(url.pathname).toBe('/v1/device/data')
    dataCalls++
    requestedAfter = Number(url.searchParams.get('after'))
    if (failData) {
      return Response.json({ message: 'do-not-echo-token' }, { status: failData })
    }
    const record = {
      customer_id: 'p1',
      device_id: 'scale',
      create_time: timestamp,
      scale_data: { weight }
    }
    return Response.json({
      res_code: 1,
      data: [
        record,
        record,
        { ...record, customer_id: 'p2', scale_data: { weight: 700 } },
        { ...record, create_time: timestamp - 120 * 86400 }
      ]
    })
  }
  const login = async (id: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/eufy/login',
      headers: { cookie: cookie(id) },
      payload: { email: 'eufy@example.com', password: 'never-store-this-password' }
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('private-token')
    expect(res.body).not.toContain('never-store')
    return res.json().setupId as string
  }
  const select = (id: string, setupId: string, profileId: string) =>
    app.inject({
      method: 'POST',
      url: '/api/integrations/eufy/profile',
      headers: { cookie: cookie(id) },
      payload: { setupId, profileId }
    })
  try {
    for (const id of ids) {
      await sql`INSERT INTO users (id, email, display_name, role) VALUES (${id}, ${`${id}@example.com`}, 'Eufy test', 'member')`
    }
    expect((await app.inject({ url: '/api/integrations/eufy/status' })).statusCode).toBe(401)
    expect(
      (await app.inject({ method: 'POST', url: '/api/integrations/eufy/login', payload: {} }))
        .statusCode
    ).toBe(401)
    const setupId = await login(ids[0])
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/integrations/eufy/login',
      headers: { cookie: cookie(ids[0]), 'content-type': 'application/json' },
      payload: '{"password":"never-store-this-password"'
    })
    expect(malformed.statusCode).toBe(400)
    expect(malformed.body).not.toContain('never-store')
    expect((await sql`SELECT * FROM integration_connection WHERE user_id = ${ids[0]}`).length).toBe(
      0
    )
    const [storedSetup] = await sql`SELECT * FROM eufy_setup WHERE user_id = ${ids[0]}`
    expect(JSON.stringify(storedSetup)).not.toContain('never-store')
    expect(JSON.stringify(storedSetup)).not.toContain('private-token')
    expect((await select(ids[1], setupId, 'p1')).statusCode).toBe(400)
    expect((await select(ids[0], setupId, 'unknown')).statusCode).toBe(400)
    const connected = await select(ids[0], setupId, 'p1')
    expect(connected.statusCode).toBe(200)
    expect(connected.json()).toMatchObject({
      status: 'connected',
      profileName: 'One',
      lastError: null
    })
    const [connection] = await sql`SELECT * FROM integration_connection WHERE user_id = ${ids[0]}`
    expect(connection.access_token).not.toContain('private-token')
    expect(connection.refresh_token).toBeNull()
    const lookbackDays = (Date.now() / 1000 - requestedAfter) / 86400
    expect(lookbackDays).toBeGreaterThan(87)
    expect(lookbackDays).toBeLessThan(93)
    expect((await sql`SELECT * FROM eufy_setup WHERE user_id = ${ids[0]}`).length).toBe(0)
    expect((await sql`SELECT * FROM measurement WHERE user_id = ${ids[0]}`).length).toBe(1)
    weight = 800
    await sql`UPDATE eufy_sync SET next_sync_at = now() WHERE connection_id = ${connection.id}`
    await syncEufy(ids[0])
    const readings = await sql`SELECT weight_kg FROM measurement WHERE user_id = ${ids[0]}`
    expect(readings).toHaveLength(1)
    expect(Number(readings[0].weight_kg)).toBe(80)
    const race = await app.inject({ url: '/api/race', headers: { cookie: cookie(ids[0]) } })
    expect(
      race.json().participants.find((p: { id: string }) => p.id === ids[0]).measurements
    ).toHaveLength(1)
    const secondSetup = await login(ids[1])
    expect((await select(ids[1], secondSetup, 'p1')).statusCode).toBe(409)
    expect((await select(ids[1], secondSetup, 'p2')).statusCode).toBe(200)
    const [secondReading] = await sql`SELECT weight_kg FROM measurement WHERE user_id = ${ids[1]}`
    expect(Number(secondReading.weight_kg)).toBe(70)

    failData = 503
    await sql`UPDATE eufy_sync SET next_sync_at = now() WHERE connection_id = ${connection.id}`
    await syncEufy(ids[0])
    const status = await app.inject({
      url: '/api/integrations/eufy/status',
      headers: { cookie: cookie(ids[0]) }
    })
    expect(status.json().status).toBe('connected')
    expect(status.json().lastError).toContain('ei ole käytettävissä')
    expect(status.body).not.toContain('do-not-echo-token')
    failData = 401
    await sql`UPDATE eufy_sync SET next_sync_at = now() WHERE connection_id = ${connection.id}`
    await syncEufy(ids[0])
    expect(
      (await sql`SELECT status FROM integration_connection WHERE id = ${connection.id}`)[0].status
    ).toBe('reconnect_required')
    const stoppedAt = dataCalls
    await syncEufy(ids[0])
    expect(dataCalls).toBe(stoppedAt)
    expect(loginCalls).toBe(2)
    await sql`UPDATE users SET disabled_at = now() WHERE id = ${ids[1]}`
    await sql`UPDATE eufy_sync SET next_sync_at = now() WHERE connection_id IN (SELECT id FROM integration_connection WHERE user_id = ${ids[1]})`
    await syncEufy(ids[1])
    expect(dataCalls).toBe(stoppedAt)
    expect(
      (
        await app.inject({
          url: '/api/integrations/eufy/status',
          headers: { cookie: cookie(ids[1]) }
        })
      ).statusCode
    ).toBe(401)
    failData = 0
    const reconnectSetup = await login(ids[0])
    expect((await select(ids[0], reconnectSetup, 'p1')).statusCode).toBe(200)
    expect((await sql`SELECT * FROM measurement WHERE user_id = ${ids[0]}`).length).toBe(1)
    await sql`UPDATE integration_connection SET expires_at = now() - interval '1 second' WHERE id = ${connection.id}`
    await sql`UPDATE eufy_sync SET next_sync_at = now() WHERE connection_id = ${connection.id}`
    const beforeExpiry = dataCalls
    await syncEufy(ids[0])
    expect(dataCalls).toBe(beforeExpiry)
    expect(
      (await sql`SELECT status FROM integration_connection WHERE id = ${connection.id}`)[0].status
    ).toBe('reconnect_required')

    // A response from an old in-flight request must not survive disconnect.
    await sql`UPDATE integration_connection SET status = 'active', expires_at = now() + interval '1 day' WHERE id = ${connection.id}`
    await sql`UPDATE eufy_sync SET next_sync_at = now() WHERE connection_id = ${connection.id}`
    const claimed = await claimSync(ids[0])
    expect(claimed).toBeTruthy()
    expect(await claimSync(ids[0])).toBeUndefined()
    const disconnected = await app.inject({
      method: 'DELETE',
      url: '/api/integrations/eufy',
      headers: { cookie: cookie(ids[0]) }
    })
    expect(disconnected.statusCode).toBe(204)
    await finishSync(claimed!, [
      { externalId: 'should-not-exist', measuredAt: new Date(), weightKg: 60 }
    ])
    expect((await sql`SELECT * FROM measurement WHERE user_id = ${ids[0]}`).length).toBe(1)
    expect((await sql`SELECT * FROM integration_connection WHERE user_id = ${ids[0]}`).length).toBe(
      0
    )
    expect((await sql`SELECT * FROM eufy_sync WHERE connection_id = ${connection.id}`).length).toBe(
      0
    )
    expect(logs.join('')).not.toContain('never-store-this-password')
    expect(logs.join('')).not.toContain('private-token')
  } finally {
    globalThis.fetch = originalFetch
    await app.close()
    await sql`DELETE FROM users WHERE id IN ${sql(ids)}`
    await closeDatabase()
  }
})

test('Eufy settings requires profile selection, clears credentials, and supports reconnect', async ({
  page
}) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 'test',
        email: 'test@example.com',
        display_name: 'Test',
        role: 'member'
      }
    })
  )
  await page.route('**/api/integrations/withings/status', (route) =>
    route.fulfill({
      json: {
        connected: true,
        configured: true,
        automaticUpdates: true
      }
    })
  )
  let connected = false
  await page.route('**/api/integrations/eufy/status', (route) =>
    route.fulfill({
      json: {
        status: connected ? 'reconnect_required' : 'disconnected',
        profileName: connected ? 'Me' : undefined
      }
    })
  )
  await page.route('**/api/integrations/eufy/login', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: 'eufy@example.com',
      password: 'secret'
    })
    await route.fulfill({
      json: {
        setupId: 'setup',
        profiles: [
          { id: 'me', name: 'Me' },
          { id: 'other', name: 'Other' }
        ]
      }
    })
  })
  await page.route('**/api/integrations/eufy/profile', (route) => {
    expect(route.request().postDataJSON()).toEqual({ setupId: 'setup', profileId: 'me' })
    connected = true
    return route.fulfill({
      json: { status: 'connected', profileName: 'Me', lastSyncedAt: new Date().toISOString() }
    })
  })
  await page.route('**/api/integrations/eufy', (route) => {
    connected = false
    return route.fulfill({ status: 204 })
  })
  await page.goto('/settings')
  const eufy = page.getByRole('region', { name: 'Eufy Life', exact: true })
  await eufy.getByRole('button', { name: 'Yhdistä Eufy Life', exact: true }).click()
  await eufy.getByLabel('Eufy Life -sähköposti').fill('eufy@example.com')
  await eufy.getByLabel('Eufy Life -salasana').fill('secret')
  await eufy.getByRole('button', { name: 'Kirjaudu Eufy Lifeen' }).click()
  await expect(eufy.getByLabel('Eufy Life -salasana')).toHaveCount(0)
  await expect(eufy.getByRole('button', { name: 'Käytä tätä profiilia' })).toBeDisabled()
  await eufy.getByLabel('Eufy Life -profiilisi').selectOption('me')
  await eufy.getByRole('button', { name: 'Käytä tätä profiilia' }).click()
  await expect(eufy.getByText('Profiili: Me')).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'Withings', exact: true })
      .getByText('Yhdistetty', { exact: true })
  ).toBeVisible()
  await page.reload()
  await expect(eufy.getByText('Yhdistä uudelleen jatkaaksesi synkronointia')).toBeVisible()
  await eufy.getByRole('button', { name: 'Yhdistä Eufy Life uudelleen' }).click()
  await expect(eufy.getByLabel('Eufy Life -salasana')).toHaveValue('')
  await expect(eufy.getByLabel('Eufy Life -sähköposti')).toHaveValue('')
  await eufy.getByRole('button', { name: 'Peruuta' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await eufy.getByRole('button', { name: 'Katkaise Eufy Life -yhteys' }).click()
  await expect(eufy.getByText('Ei yhdistetty', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('secret')
})
