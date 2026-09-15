import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { test as base, expect } from './app-fixtures'

const execFileAsync = promisify(execFile)
// The CLI claims every due event. Give it a database containing only this scenario's queue.
const test = base.extend<{}, { measurementQueue: void }>({
  measurementQueue: [
    async ({}, use) => {
      await use()
    },
    { scope: 'worker', auto: true }
  ]
})

test('webhook worker imports and corrects the same Withings reading without duplicates', async ({
  application,
  request,
  signIn
}) => {
  const user = await signIn()
  const { sql, databaseUrl } = application
  const withingsUserId = '987654322'
  const requests: URLSearchParams[] = []
  let weight = 80500
  const provider = createServer(async (incoming, response) => {
    if (incoming.url !== '/measure' || incoming.method !== 'POST') {
      response.writeHead(404).end()
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of incoming) {
      chunks.push(Buffer.from(chunk))
    }
    expect(incoming.headers.authorization).toBe('Bearer access-token')
    requests.push(new URLSearchParams(Buffer.concat(chunks).toString('utf8')))
    response.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        status: 0,
        body: {
          more: 0,
          measuregrps: [
            {
              date: 1727740800,
              grpid: 1001,
              measures: [
                { type: 1, unit: -3, value: weight },
                { type: 6, unit: -1, value: 201 }
              ]
            }
          ]
        }
      })
    )
  })
  try {
    provider.listen(0, '127.0.0.1')
    await once(provider, 'listening')
    const address = provider.address()
    if (!address || typeof address === 'string') {
      throw new Error('Missing provider port')
    }
    await sql`INSERT INTO integration_connection
      (user_id, provider, access_token, refresh_token, expires_at, status, external_user_id)
      VALUES (${user.id}, 'withings', 'access-token', 'refresh-token', now() + interval '1 hour', 'active', ${withingsUserId})`
    const importWebhook = async (endDate: number) => {
      const queued = await request.post('/webhooks/withings', {
        data: `userid=${withingsUserId}&appli=1&startdate=1727740800&enddate=${endDate}`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' }
      })
      expect(queued.status()).toBe(202)
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        ['--import', 'tsx', 'backend/src/cron/fetch-withings-measurement/index.ts'],
        {
          cwd: resolve(__dirname, '..'),
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
            WITHINGS_API_BASE_URL: `http://127.0.0.1:${address.port}`
          }
        }
      )
      expect(stderr).toBe('')
      expect(stdout).toContain('1 succeeded, 0 failed, 1 measurement(s) upserted')
    }
    await importWebhook(1727827200)
    expect(requests).toHaveLength(1)
    expect(Object.fromEntries(requests[0])).toMatchObject({
      action: 'getmeas',
      category: '1',
      meastype: '1',
      startdate: '1727740800',
      enddate: '1727827200'
    })
    const initial =
      await sql`SELECT id, weight_kg::float AS weight FROM measurement WHERE user_id = ${user.id}`
    expect(initial).toHaveLength(1)
    expect(initial[0].weight).toBe(80.5)
    weight = 79800
    await importWebhook(1727913600)
    expect(requests).toHaveLength(2)
    expect(
      await sql`SELECT id, weight_kg::float AS weight, measured_at, source, external_id
      FROM measurement WHERE user_id = ${user.id}`
    ).toEqual([
      {
        id: initial[0].id,
        weight: 79.8,
        measured_at: new Date('2024-10-01T00:00:00.000Z'),
        source: 'withings',
        external_id: '1001:weight'
      }
    ])
    expect(
      await sql`SELECT status FROM withings_weight_webhook_event WHERE withings_userid = ${withingsUserId}`
    ).toEqual([{ status: 'succeeded' }, { status: 'succeeded' }])
  } finally {
    await new Promise<void>((resolve) => provider.close(() => resolve()))
    await sql`DELETE FROM withings_weight_webhook_event WHERE withings_userid = ${withingsUserId}`
  }
})
