import { pathToFileURL } from 'node:url'

import { config } from '../../config.js'
import { closeDatabase } from '../../database.js'
import { fetchWithingsMeasurements } from './fetch-measurements.js'
import {
  claimDueWebhookEvents,
  findConnection,
  markEventPermanentlyFailed,
  markEventRetryable,
  markEventSucceeded,
  updateConnectionToken,
  upsertMeasurements
} from './queries.js'
import {
  type IntegrationConnection,
  type WithingsWebhookEvent,
  withingsRefreshTokenResponseSchema
} from './types.js'

const batchSize = Number.parseInt(process.env.WITHINGS_WEBHOOK_BATCH_SIZE ?? '20', 10)
const maxAttempts = Number.parseInt(process.env.WITHINGS_WEBHOOK_MAX_ATTEMPTS ?? '10', 10)
const staleProcessingMinutes = Number.parseInt(
  process.env.WITHINGS_WEBHOOK_STALE_PROCESSING_MINUTES ?? '15',
  10
)

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

  const response = await fetch(new URL('/v2/oauth2', config.withingsApiBaseUrl), {
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST'
  })
  const responseBody = await response.json()
  const parsed = withingsRefreshTokenResponseSchema.parse(responseBody)

  if (!response.ok || parsed.status !== 0) {
    throw new Error(withingsErrorMessage('Withings token refresh failed', responseBody))
  }

  return updateConnectionToken(connection, {
    accessToken: parsed.body.access_token,
    expiresIn: parsed.body.expires_in,
    externalUserId: parsed.body.userid?.toString(),
    refreshToken: parsed.body.refresh_token
  })
}

async function ensureFreshConnectionToken(connection: IntegrationConnection) {
  if (!shouldRefreshToken(connection.expires_at)) {
    return connection
  }

  return refreshConnectionToken(connection)
}

async function markEventFailed(event: WithingsWebhookEvent, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (event.attempts >= maxAttempts) {
    await markEventPermanentlyFailed(event, message)
    return
  }

  await markEventRetryable(event, message, retryDelaySeconds(event.attempts))
}

async function processEvent(event: WithingsWebhookEvent) {
  const connection = await findConnection(event)

  if (!connection) {
    throw new Error(
      `No active Withings connection found for Withings user ${event.withings_userid}`
    )
  }

  const freshConnection = await ensureFreshConnectionToken(connection)
  const measurements = await fetchWithingsMeasurements(
    event,
    freshConnection.access_token,
    config.withingsApiBaseUrl
  )

  await upsertMeasurements(freshConnection.user_id, measurements)
  await markEventSucceeded(event)

  return measurements.length
}

export async function main() {
  const events = await claimDueWebhookEvents(batchSize, staleProcessingMinutes)

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(async () => {
      await closeDatabase()
    })
}
