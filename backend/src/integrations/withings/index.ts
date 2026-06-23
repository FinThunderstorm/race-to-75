import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { config } from '../../config.js'
import { fetchWithingsMeasurements } from '../../cron/fetch-withings-measurement/fetch-measurements.js'
import { upsertMeasurements } from '../../cron/fetch-withings-measurement/queries.js'
import { withingsRefreshTokenResponseSchema } from '../../cron/fetch-withings-measurement/types.js'
import { sql } from '../../database.js'

type ConnectQuery = {
  token?: string
}

type CallbackQuery = {
  code?: string
  error?: string
  error_description?: string
  state?: string
}

type StatusQuery = {
  token?: string
}

type SignedStatePayload = {
  exp: number
  nonce: string
}

type WithingsConnectionStatus = {
  external_user_id: string | null
  status: string
}

const withingsWeightApplication = '1'
const withingsAuthorizationScope = 'user.metrics'
const withingsNotifySubscribeResponseSchema = z.object({
  status: z.number().int()
})

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack
    }
  }

  return { message: String(error) }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function htmlPage(title: string, body: string) {
  const escapedTitle = escapeHtml(title)
  const escapedBody = escapeHtml(body)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapedTitle}</title>
  </head>
  <body>
    <main>
      <h1>${escapedTitle}</h1>
      <p>${escapedBody}</p>
    </main>
  </body>
</html>`
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function signStateBody(body: string, secret: string) {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

function createSignedState(payload: SignedStatePayload, secret: string) {
  const body = base64UrlJson(payload)
  const signature = signStateBody(body, secret)

  return `${body}.${signature}`
}

function parseSignedState(state: string, secret: string) {
  const [body, signature] = state.split('.')

  if (!body || !signature) {
    throw new Error('Invalid Withings OAuth state')
  }

  const expectedSignature = signStateBody(body, secret)
  const signatureBuffer = Buffer.from(signature)
  const expectedSignatureBuffer = Buffer.from(expectedSignature)

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    throw new Error('Invalid Withings OAuth state')
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown
  const parsedPayload = z
    .object({
      exp: z.number().int().positive(),
      nonce: z.string().min(1)
    })
    .parse(payload)

  if (parsedPayload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Expired Withings OAuth state')
  }

  return parsedPayload
}

function safeTokenEquals(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)

  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

async function findBootstrapWithingsConnection(bootstrapEmail: string) {
  const [connection] = await sql<WithingsConnectionStatus[]>`
    SELECT external_user_id, status
    FROM integration_connection connection
    JOIN users app_user ON app_user.id = connection.user_id
    WHERE app_user.email = ${bootstrapEmail}
      AND connection.provider = 'withings'
    LIMIT 1
  `

  return connection
}

function requireTemporaryConnectConfig() {
  const missing = [
    ['WITHINGS_CLIENT_ID', config.withingsClientId],
    ['WITHINGS_CLIENT_SECRET', config.withingsClientSecret],
    ['WITHINGS_REDIRECT_URI', config.withingsRedirectUri],
    ['WITHINGS_WEBHOOK_CALLBACK_URL', config.withingsWebhookCallbackUrl],
    ['WITHINGS_CONNECT_TOKEN', config.withingsConnectToken],
    ['WITHINGS_BOOTSTRAP_EMAIL', config.withingsBootstrapEmail],
    ['WITHINGS_BOOTSTRAP_DISPLAY_NAME', config.withingsBootstrapDisplayName]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(`Missing Withings integration config: ${missing.join(', ')}`)
  }

  return {
    bootstrapDisplayName: config.withingsBootstrapDisplayName as string,
    bootstrapEmail: config.withingsBootstrapEmail as string,
    bootstrapRole: config.withingsBootstrapRole,
    clientId: config.withingsClientId as string,
    clientSecret: config.withingsClientSecret as string,
    connectToken: config.withingsConnectToken as string,
    redirectUri: config.withingsRedirectUri as string,
    webhookCallbackUrl: config.withingsWebhookCallbackUrl as string
  }
}

async function upsertBootstrapUser() {
  const temporaryConfig = requireTemporaryConnectConfig()
  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (email, display_name, role)
    VALUES (
      ${temporaryConfig.bootstrapEmail},
      ${temporaryConfig.bootstrapDisplayName},
      ${temporaryConfig.bootstrapRole}
    )
    ON CONFLICT (email)
    DO UPDATE SET
      display_name = EXCLUDED.display_name,
      role = EXCLUDED.role
    RETURNING id
  `

  return user
}

async function exchangeAuthorizationCode(code: string) {
  const temporaryConfig = requireTemporaryConnectConfig()
  const body = new URLSearchParams({
    action: 'requesttoken',
    client_id: temporaryConfig.clientId,
    client_secret: temporaryConfig.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: temporaryConfig.redirectUri
  })

  const response = await fetch(new URL('/v2/oauth2', config.withingsApiBaseUrl), {
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST'
  })
  const responseBody = await response.json()
  const status = z.object({ status: z.number().int() }).parse(responseBody).status

  if (!response.ok || status !== 0) {
    throw new Error(`Withings token exchange failed: ${JSON.stringify(responseBody)}`)
  }

  const parsed = withingsRefreshTokenResponseSchema.parse(responseBody)

  if (!parsed.body.userid) {
    throw new Error('Withings token exchange response did not include userid')
  }

  return {
    accessToken: parsed.body.access_token,
    expiresIn: parsed.body.expires_in,
    externalUserId: parsed.body.userid.toString(),
    refreshToken: parsed.body.refresh_token
  }
}

async function upsertWithingsConnection(
  userId: string,
  token: {
    accessToken: string
    expiresIn: number
    externalUserId: string
    refreshToken: string
  }
) {
  await sql`
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
      ${userId},
      'withings',
      ${token.accessToken},
      ${token.refreshToken},
      now() + (${token.expiresIn} * interval '1 second'),
      'active',
      ${token.externalUserId}
    )
    ON CONFLICT (user_id, provider)
    DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      expires_at = EXCLUDED.expires_at,
      status = EXCLUDED.status,
      external_user_id = EXCLUDED.external_user_id
  `
}

async function fetchInitialMeasurements(userId: string, accessToken: string) {
  const endAt = new Date()
  const startAt = new Date(endAt.getTime() - config.withingsInitialSyncDays * 24 * 60 * 60 * 1000)
  const measurements = await fetchWithingsMeasurements(
    { end_at: endAt, start_at: startAt },
    accessToken,
    config.withingsApiBaseUrl
  )

  await upsertMeasurements(userId, measurements)

  return measurements.length
}

async function subscribeToWithingsWeightNotifications(accessToken: string) {
  const temporaryConfig = requireTemporaryConnectConfig()
  const body = new URLSearchParams({
    action: 'subscribe',
    appli: withingsWeightApplication,
    callbackurl: temporaryConfig.webhookCallbackUrl,
    comment: 'Race to 75 weight measurements'
  })

  const response = await fetch(new URL('/notify', config.withingsApiBaseUrl), {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    method: 'POST'
  })
  const responseBody = await response.json()
  const status = z.object({ status: z.number().int() }).parse(responseBody).status

  if (!response.ok || status !== 0) {
    throw new Error(`Withings notification subscription failed: ${JSON.stringify(responseBody)}`)
  }

  withingsNotifySubscribeResponseSchema.parse(responseBody)
}

function verifyTemporaryConnectToken(token: string | undefined) {
  const temporaryConfig = requireTemporaryConnectConfig()

  if (!token || !safeTokenEquals(token, temporaryConfig.connectToken)) {
    throw new Error('Invalid Withings connect token')
  }

  return temporaryConfig
}

export async function handleWithingsConnect(
  request: FastifyRequest<{ Querystring: ConnectQuery }>,
  reply: FastifyReply
) {
  try {
    const temporaryConfig = verifyTemporaryConnectToken(request.query.token)
    const state = createSignedState(
      {
        exp: Math.floor(Date.now() / 1000) + 10 * 60,
        nonce: randomUUID()
      },
      temporaryConfig.connectToken
    )
    const authorizeUrl = new URL(config.withingsAuthorizeUrl)

    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('client_id', temporaryConfig.clientId)
    authorizeUrl.searchParams.set('scope', withingsAuthorizationScope)
    authorizeUrl.searchParams.set('redirect_uri', temporaryConfig.redirectUri)
    authorizeUrl.searchParams.set('state', state)

    return reply.redirect(authorizeUrl.toString())
  } catch (error) {
    request.log.warn({ error: errorDetails(error) }, 'Withings connect failed')

    return reply.status(403).send({ error: 'Withings connect is not available' })
  }
}

export async function handleWithingsCallback(
  request: FastifyRequest<{ Querystring: CallbackQuery }>,
  reply: FastifyReply
) {
  try {
    const temporaryConfig = requireTemporaryConnectConfig()

    if (request.query.error) {
      return reply
        .status(400)
        .type('text/html')
        .send(
          htmlPage(
            'Withings connection failed',
            request.query.error_description ?? request.query.error
          )
        )
    }

    if (!request.query.code || !request.query.state) {
      return reply
        .status(400)
        .type('text/html')
        .send(htmlPage('Withings connection failed', 'Missing OAuth code or state.'))
    }

    parseSignedState(request.query.state, temporaryConfig.connectToken)

    const user = await upsertBootstrapUser()
    const token = await exchangeAuthorizationCode(request.query.code)
    await upsertWithingsConnection(user.id, token)

    let initialMeasurementCount: number | undefined
    let notificationSubscriptionSucceeded = true

    try {
      await subscribeToWithingsWeightNotifications(token.accessToken)
    } catch (error) {
      notificationSubscriptionSucceeded = false
      request.log.error({ error: errorDetails(error) }, 'Withings notification subscription failed')
    }

    try {
      initialMeasurementCount = await fetchInitialMeasurements(user.id, token.accessToken)
    } catch (error) {
      request.log.error({ error: errorDetails(error) }, 'Initial Withings measurement sync failed')
    }

    const message =
      initialMeasurementCount === undefined
        ? 'Connected. Initial measurement sync failed, but future webhook processing can still retry new measurements.'
        : `Connected. Imported ${initialMeasurementCount} Withings measurement(s).`
    const subscriptionMessage = notificationSubscriptionSucceeded
      ? ' Body & Weight notifications are subscribed.'
      : ' Body & Weight notification subscription failed; reconnect after checking the callback URL in Withings.'

    return reply
      .type('text/html')
      .send(htmlPage('Withings connected', `${message}${subscriptionMessage}`))
  } catch (error) {
    const details = errorDetails(error)
    request.log.error({ error: details }, 'Withings OAuth callback failed')

    return reply
      .status(400)
      .type('text/html')
      .send(htmlPage('Withings connection failed', details.message))
  }
}

export async function handleWithingsStatus(
  request: FastifyRequest<{ Querystring: StatusQuery }>,
  reply: FastifyReply
) {
  try {
    const temporaryConfig = verifyTemporaryConnectToken(request.query.token)
    const connection = await findBootstrapWithingsConnection(temporaryConfig.bootstrapEmail)

    return reply.send({
      connected: connection?.status === 'active',
      externalUserId: connection?.external_user_id ?? null,
      status: connection?.status ?? 'disconnected'
    })
  } catch (error) {
    request.log.warn({ error: errorDetails(error) }, 'Withings status failed')

    return reply.status(403).send({ error: 'Withings status is not available' })
  }
}

export async function handleWithingsDisconnect(
  request: FastifyRequest<{ Querystring: StatusQuery }>,
  reply: FastifyReply
) {
  try {
    const temporaryConfig = verifyTemporaryConnectToken(request.query.token)

    await sql`
      UPDATE integration_connection connection
      SET status = 'disconnected'
      FROM users app_user
      WHERE app_user.id = connection.user_id
        AND app_user.email = ${temporaryConfig.bootstrapEmail}
        AND connection.provider = 'withings'
    `

    return reply.status(204).send()
  } catch (error) {
    request.log.warn({ error: errorDetails(error) }, 'Withings disconnect failed')

    return reply.status(403).send({ error: 'Withings disconnect is not available' })
  }
}
