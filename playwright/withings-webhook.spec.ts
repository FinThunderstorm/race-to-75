import { expect, test } from './app-fixtures'

const withingsUserId = 987654321
const rawBody = `userid=${withingsUserId}&appli=1&startdate=1727740800&enddate=1727827200`

test.describe('POST /webhooks/withings', () => {
  test.beforeEach(async ({ application: { sql } }) => {
    await sql`
      DELETE FROM withings_weight_webhook_event
      WHERE withings_userid = ${withingsUserId}
    `
  })

  test('stores and deduplicates weight webhook events', async ({
    request,
    application: { sql }
  }) => {
    const response = await request.post('/webhooks/withings', {
      data: rawBody,
      headers: { 'content-type': 'application/x-www-form-urlencoded' }
    })

    expect(response.status()).toBe(202)
    expect(await response.json()).toMatchObject({ status: 'pending' })

    const rows = await sql`
      SELECT raw_body, status, withings_userid::text, start_at, end_at
      FROM withings_weight_webhook_event
      WHERE withings_userid = ${withingsUserId}
    `

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      end_at: new Date('2024-10-02T00:00:00.000Z'),
      raw_body: rawBody,
      start_at: new Date('2024-10-01T00:00:00.000Z'),
      status: 'pending',
      withings_userid: withingsUserId.toString()
    })
    const secondResponse = await request.post('/webhooks/withings', {
      data: rawBody,
      headers: { 'content-type': 'application/x-www-form-urlencoded' }
    })

    expect(response.status()).toBe(202)
    expect(secondResponse.status()).toBe(202)

    const firstBody = await response.json()
    const secondBody = await secondResponse.json()

    expect(secondBody.id).toBe(firstBody.id)

    const [{ count }] = await sql`
      SELECT count(*)::int
      FROM withings_weight_webhook_event
      WHERE withings_userid = ${withingsUserId}
    `

    expect(count).toBe(1)
  })

  test('ignores non-weight webhook events', async ({ request, application: { sql } }) => {
    const response = await request.post('/webhooks/withings', {
      data: `userid=${withingsUserId}&appli=16&date=2026-06-19`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' }
    })

    expect(response.status()).toBe(202)
    expect(await response.json()).toEqual({ status: 'ignored' })

    const [{ count }] = await sql`
      SELECT count(*)::int
      FROM withings_weight_webhook_event
      WHERE withings_userid = ${withingsUserId}
    `

    expect(count).toBe(0)
  })
})
