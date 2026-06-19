import { sql } from '../../database.js'

import type { IntegrationConnection, WithingsMeasurement, WithingsWebhookEvent } from './types.js'

export async function claimDueWebhookEvents(batchSize: number, staleProcessingMinutes: number) {
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

export async function findConnection(event: WithingsWebhookEvent) {
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

export async function updateConnectionToken(
  connection: IntegrationConnection,
  token: {
    accessToken: string
    expiresIn: number
    externalUserId?: string
    refreshToken: string
  }
) {
  const [updatedConnection] = await sql<IntegrationConnection[]>`
    UPDATE integration_connection
    SET
      access_token = ${token.accessToken},
      refresh_token = ${token.refreshToken},
      expires_at = now() + (${token.expiresIn} * interval '1 second'),
      external_user_id = COALESCE(${token.externalUserId ?? null}, external_user_id)
    WHERE id = ${connection.id}
    RETURNING id, user_id, access_token, refresh_token, expires_at
  `

  return updatedConnection
}

export async function upsertMeasurements(userId: string, measurements: WithingsMeasurement[]) {
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

export async function markEventSucceeded(event: WithingsWebhookEvent) {
  await sql`
    UPDATE withings_weight_webhook_event
    SET
      status = 'succeeded',
      processed_at = now(),
      last_error = NULL
    WHERE id = ${event.id}
  `
}

export async function markEventPermanentlyFailed(event: WithingsWebhookEvent, message: string) {
  await sql`
    UPDATE withings_weight_webhook_event
    SET
      status = 'failed',
      processed_at = now(),
      last_error = ${message}
    WHERE id = ${event.id}
  `
}

export async function markEventRetryable(
  event: WithingsWebhookEvent,
  message: string,
  retryDelaySeconds: number
) {
  await sql`
    UPDATE withings_weight_webhook_event
    SET
      status = 'pending',
      next_attempt_at = now() + (${retryDelaySeconds} * interval '1 second'),
      last_error = ${message}
    WHERE id = ${event.id}
  `
}
