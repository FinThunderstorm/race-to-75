import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { sql } from '../../database.js'
import {
  type ParsedWithingsWebhookBody,
  type StoreWithingsWebhookEvent,
  type WithingsWebhookBody,
  type WithingsWeightWebhookPayload,
  withingsWebhookApplicationSchema,
  withingsWeightWebhookPayloadSchema
} from './types.js'

export type { ParsedWithingsWebhookBody } from './types.js'

type WithingsWebhookRequest = FastifyRequest<{
  Body: ParsedWithingsWebhookBody | undefined
}>

function parseFormBody(rawBody: string): WithingsWebhookBody {
  return Object.fromEntries(new URLSearchParams(rawBody))
}

function isEmptyObject(value: unknown): value is Record<string, never> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  )
}

async function storeWithingsWebhookEvent(rawBody: string, payload: WithingsWeightWebhookPayload) {
  const [event] = await sql<[{ id: string; status: string }]>`
    INSERT INTO withings_weight_webhook_event (
      raw_body,
      withings_userid,
      start_at,
      end_at
    )
    VALUES (
      ${rawBody},
      ${payload.userid},
      to_timestamp(${payload.startdate}),
      to_timestamp(${payload.enddate})
    )
    ON CONFLICT (withings_userid, start_at, end_at)
    DO UPDATE SET raw_body = EXCLUDED.raw_body
    RETURNING id, status
  `

  return event
}

export function parseWithingsWebhookFormBody(
  _request: FastifyRequest,
  body: string | Buffer,
  done: (error: Error | null, body?: ParsedWithingsWebhookBody) => void
) {
  try {
    const rawBody = body.toString()

    done(null, {
      fields: parseFormBody(rawBody),
      rawBody
    })
  } catch (error) {
    done(error as Error)
  }
}

function createHandleWithingsWebhook(store: StoreWithingsWebhookEvent = storeWithingsWebhookEvent) {
  return async function handleWithingsWebhook(
    request: WithingsWebhookRequest,
    reply: FastifyReply
  ) {
    if (!request.body || isEmptyObject(request.body.fields)) {
      return reply.status(204).send()
    }

    try {
      const webhookApplication = withingsWebhookApplicationSchema.parse(request.body.fields)

      if (webhookApplication.appli !== 1) {
        request.log.info(
          { withingsWebhookApplication: webhookApplication.appli },
          'Ignored non-weight Withings webhook event'
        )

        return reply.status(202).send({ status: 'ignored' })
      }

      const payload = withingsWeightWebhookPayloadSchema.parse(request.body.fields)
      const event = await store(request.body.rawBody, payload)

      request.log.info({ withingsWebhookEventId: event.id }, 'Stored Withings webhook event')

      return reply.status(202).send({ id: event.id, status: event.status })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Invalid Withings webhook payload',
          issues: error.issues
        })
      }

      throw error
    }
  }
}

export const handleWithingsWebhook = createHandleWithingsWebhook()
