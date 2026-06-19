import { z } from 'zod'

import { config } from '../config.js'
import { closeDatabase, sql } from '../database.js'

const withingsMeasureResponseSchema = z.object({
  body: z.object({
    measuregrps: z
      .array(
        z.object({
          date: z.number().int().nonnegative(),
          grpid: z.number().int(),
          measures: z.array(
            z.object({
              type: z.number().int(),
              unit: z.number().int(),
              value: z.number()
            })
          )
        })
      )
      .default([]),
    more: z.number().int().optional(),
    offset: z.number().int().optional()
  }),
  status: z.number().int()
})

const withingsRefreshTokenResponseSchema = z.object({
  body: z.object({
    access_token: z.string().min(1),
    expires_in: z.number().int().positive(),
    refresh_token: z.string().min(1),
    userid: z.union([z.string(), z.number()]).optional()
  }),
  status: z.number().int()
})

type WithingsWebhookEvent = {
  attempts: number
  end_at: Date
  id: string
  start_at: Date
  withings_userid: string
}

type IntegrationConnection = {
  access_token: string
  expires_at: Date | null
  id: string
  refresh_token: string | null
  user_id: string
}

type WithingsMeasurement = {
  externalId: string
  measuredAt: Date
  weightKg: number
}

const batchSize = Number.parseInt(process.env.WITHINGS_WEBHOOK_BATCH_SIZE ?? '20', 10)
const maxAttempts = Number.parseInt(process.env.WITHINGS_WEBHOOK_MAX_ATTEMPTS ?? '10', 10)
const staleProcessingMinutes = Number.parseInt(
  process.env.WITHINGS_WEBHOOK_STALE_PROCESSING_MINUTES ?? '15',
  10
)

function epochSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000)
}

function shouldRefreshToken(expiresAt: Date | null) {
  if (!expiresAt) {
    return false
  }

  return expiresAt.getTime() <= Date.now() + 5 * 60 * 1000
}

function retryDelaySeconds(attempts: number) {
  return Math.min(60 * 2 ** Math.max(attempts - 1, 0), 60 * 60)
}

function withingsErrorMessage(prefix: string, responseBody: unknown) {
  return `${prefix}: ${JSON.stringify(responseBody)}`
}

async function claimDueWebhookEvents() {
  return sql<WithingsWebhookEvent[]>`
    WITH due_events AS (
      SELECT id
      FROM withings_weight_webhook_event
      WHERE (
        status = 'pending'
        AND next_attempt_at <= now()
      ) OR (
        status = 'processing'
        AND processing_started_at < now() - (${staleProcessingMinutes} * interval '1 minute')
      )
      ORDER BY received_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE withings_weight_webhook_event event
    SET
      status = 'processing',
      attempts = event.attempts + 1,
      processing_started_at = now(),
      last_error = NULL
    FROM due_events
    WHERE event.id = due_events.id
    RETURNING
      event.id,
      event.attempts,
      event.withings_userid::text,
      event.start_at,
      event.end_at
  `
}

async function findConnection(event: WithingsWebhookEvent) {
  const [connection] = await sql<IntegrationConnection[]>`
    SELECT id, user_id, access_token, refresh_token, expires_at
    FROM integration_connection
    WHERE provider = 'withings'
      AND external_user_id = ${event.withings_userid}
      AND status = 'active'
    LIMIT 1
  `

  return connection
}

async function refreshConnectionToken(connection: IntegrationConnection) {
  if (!connection.refresh_token) {
    throw new Error('Withings connection has no refresh token')
  }

  if (!config.withingsClientId || !config.withingsClientSecret) {
    throw new Error('WITHINGS_CLIENT_ID and WITHINGS_CLIENT_SECRET are required to refresh tokens')
  }

  const body = new URLSearchParams({
    action: 'requesttoken',
    client_id: config.withingsClientId,
    client_secret: config.withingsClientSecret,
    grant_type: 'refresh_token',
    refresh_token: connection.refresh_token
  })

  const response = await fetch('https://wbsapi.withings.net/v2/oauth2', {
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST'
  })
  const responseBody = await response.json()
  const parsed = withingsRefreshTokenResponseSchema.parse(responseBody)

  if (!response.ok || parsed.status !== 0) {
    throw new Error(withingsErrorMessage('Withings token refresh failed', responseBody))
  }

  const externalUserId = parsed.body.userid?.toString()
  const [updatedConnection] = await sql<IntegrationConnection[]>`
    UPDATE integration_connection
    SET
      access_token = ${parsed.body.access_token},
      refresh_token = ${parsed.body.refresh_token},
      expires_at = now() + (${parsed.body.expires_in} * interval '1 second'),
      external_user_id = COALESCE(${externalUserId ?? null}, external_user_id)
    WHERE id = ${connection.id}
    RETURNING id, user_id, access_token, refresh_token, expires_at
  `

  return updatedConnection
}

async function ensureFreshConnectionToken(connection: IntegrationConnection) {
  if (!shouldRefreshToken(connection.expires_at)) {
    return connection
  }

  return refreshConnectionToken(connection)
}

async function fetchWithingsMeasurements(event: WithingsWebhookEvent, accessToken: string) {
  const measurements: WithingsMeasurement[] = []
  let offset: number | undefined

  do {
    const body = new URLSearchParams({
      action: 'getmeas',
      category: '1',
      enddate: epochSeconds(event.end_at).toString(),
      meastype: '1',
      startdate: epochSeconds(event.start_at).toString()
    })

    if (offset !== undefined) {
      body.set('offset', offset.toString())
    }

    const response = await fetch('https://wbsapi.withings.net/measure', {
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      method: 'POST'
    })
    const responseBody = await response.json()
    const parsed = withingsMeasureResponseSchema.parse(responseBody)

    if (!response.ok || parsed.status !== 0) {
      throw new Error(withingsErrorMessage('Withings measurement fetch failed', responseBody))
    }

    for (const measureGroup of parsed.body.measuregrps) {
      const weightMeasure = measureGroup.measures.find((measure) => measure.type === 1)

      if (!weightMeasure) {
        continue
      }

      measurements.push({
        externalId: `${measureGroup.grpid}:weight`,
        measuredAt: new Date(measureGroup.date * 1000),
        weightKg: weightMeasure.value * 10 ** weightMeasure.unit
      })
    }

    offset = parsed.body.more === 1 ? parsed.body.offset : undefined
  } while (offset !== undefined)

  return measurements
}

async function upsertMeasurements(userId: string, measurements: WithingsMeasurement[]) {
  for (const measurement of measurements) {
    await sql`
      INSERT INTO measurement (user_id, weight_kg, measured_at, source, external_id)
      VALUES (
        ${userId},
        ${measurement.weightKg},
        ${measurement.measuredAt},
        'withings',
        ${measurement.externalId}
      )
      ON CONFLICT (source, external_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        weight_kg = EXCLUDED.weight_kg,
        measured_at = EXCLUDED.measured_at
    `
  }
}

async function markEventSucceeded(event: WithingsWebhookEvent) {
  await sql`
    UPDATE withings_weight_webhook_event
    SET
      status = 'succeeded',
      processed_at = now(),
      last_error = NULL
    WHERE id = ${event.id}
  `
}

async function markEventFailed(event: WithingsWebhookEvent, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (event.attempts >= maxAttempts) {
    await sql`
      UPDATE withings_weight_webhook_event
      SET
        status = 'failed',
        processed_at = now(),
        last_error = ${message}
      WHERE id = ${event.id}
    `
    return
  }

  await sql`
    UPDATE withings_weight_webhook_event
    SET
      status = 'pending',
      next_attempt_at = now() + (${retryDelaySeconds(event.attempts)} * interval '1 second'),
      last_error = ${message}
    WHERE id = ${event.id}
  `
}

async function processEvent(event: WithingsWebhookEvent) {
  const connection = await findConnection(event)

  if (!connection) {
    throw new Error(
      `No active Withings connection found for Withings user ${event.withings_userid}`
    )
  }

  const freshConnection = await ensureFreshConnectionToken(connection)
  const measurements = await fetchWithingsMeasurements(event, freshConnection.access_token)

  await upsertMeasurements(freshConnection.user_id, measurements)
  await markEventSucceeded(event)

  return measurements.length
}

async function main() {
  const events = await claimDueWebhookEvents()

  if (events.length === 0) {
    console.log('No due Withings weight webhook events')
    return
  }

  let succeeded = 0
  let failed = 0
  let measurementCount = 0

  for (const event of events) {
    try {
      measurementCount += await processEvent(event)
      succeeded += 1
    } catch (error) {
      failed += 1
      await markEventFailed(event, error)
      console.error(`Failed to process Withings webhook event ${event.id}`, error)
    }
  }

  console.log(
    `Processed ${events.length} Withings webhook event(s): ${succeeded} succeeded, ${failed} failed, ${measurementCount} measurement(s) upserted`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDatabase()
  })
