import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { promisify } from 'node:util'

import { expect, test } from '@playwright/test'
import postgres from 'postgres'

const execFileAsync = promisify(execFile)
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/race_to_75'
const withingsUserId = '987654322'
const userEmail = 'withings-cron-test@example.com'

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
}

test('fetches Withings weight measurements and upserts them from queued webhook events', async () => {
  const sql = postgres(databaseUrl)
  const withingsRequests: URLSearchParams[] = []
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.url !== '/measure' || request.method !== 'POST') {
      response.writeHead(404).end()
      return
    }

    expect(request.headers.authorization).toBe('Bearer access-token')
    withingsRequests.push(new URLSearchParams(await readRequestBody(request)))
    response.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        body: {
          measuregrps: [
            {
              date: 1727740800,
              grpid: 1001,
              measures: [
                { type: 1, unit: -3, value: 80500 },
                { type: 6, unit: -1, value: 201 }
              ]
            }
          ],
          more: 0
        },
        status: 0
      })
    )
  })

  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()

    if (!address || typeof address === 'string') {
      throw new Error('Mock Withings server did not expose a port')
    }

    await sql.begin(async (transaction) => {
      await transaction`
        DELETE FROM measurement
        WHERE source = 'withings'
          AND external_id IN ('1001:weight')
      `
      await transaction`
        DELETE FROM withings_weight_webhook_event
        WHERE withings_userid = ${withingsUserId}
      `
      await transaction`
        DELETE FROM users
        WHERE email = ${userEmail}
      `
      const [user] = await transaction<{ id: string }[]>`
        INSERT INTO users (email, display_name, role)
        VALUES (${userEmail}, 'Withings Cron Test', 'member')
        RETURNING id
      `
      await transaction`
        INSERT INTO integration_connection (
          user_id,
          provider,
          access_token,
          refresh_token,
          expires_at,
          status,
          external_user_id
        )
        VALUES (
          ${user.id},
          'withings',
          'access-token',
          'refresh-token',
          now() + interval '1 hour',
          'active',
          ${withingsUserId}
        )
      `
      await transaction`
        INSERT INTO withings_weight_webhook_event (
          raw_body,
          withings_userid,
          start_at,
          end_at
        )
        VALUES (
          'userid=987654322&appli=1&startdate=1727740800&enddate=1727827200',
          ${withingsUserId},
          '2024-10-01T00:00:00.000Z',
          '2024-10-02T00:00:00.000Z'
        )
      `
    })

    await execFileAsync(
      'node',
      ['--import', 'tsx', 'backend/src/cron/fetch-withings-measurement/index.ts'],
      {
        cwd: '../',
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          WITHINGS_API_BASE_URL: `http://127.0.0.1:${address.port}`
        }
      }
    )

    expect(withingsRequests).toHaveLength(1)
    expect(withingsRequests[0].get('action')).toBe('getmeas')
    expect(withingsRequests[0].get('category')).toBe('1')
    expect(withingsRequests[0].get('meastype')).toBe('1')
    expect(withingsRequests[0].get('startdate')).toBe('1727740800')
    expect(withingsRequests[0].get('enddate')).toBe('1727827200')

    const measurements = await sql`
      SELECT weight_kg::float, measured_at, source, external_id
      FROM measurement
      WHERE source = 'withings'
        AND external_id = '1001:weight'
    `
    const events = await sql`
      SELECT status
      FROM withings_weight_webhook_event
      WHERE withings_userid = ${withingsUserId}
    `

    expect(measurements).toHaveLength(1)
    expect(measurements[0]).toMatchObject({
      external_id: '1001:weight',
      measured_at: new Date('2024-10-01T00:00:00.000Z'),
      source: 'withings',
      weight_kg: 80.5
    })
    expect(events).toEqual([{ status: 'succeeded' }])
  } finally {
    server.close()
    await sql.end()
  }
})
