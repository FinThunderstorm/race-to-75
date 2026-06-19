import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { sql } from '../database.js'

const withingsWebhookApplicationSchema = z.object({
  appli: z.coerce.number().int().positive()
})

const withingsWeightWebhookPayloadSchema = z
  .object({
    appli: z.coerce.number().int().positive(),
    enddate: z.coerce.number().int().nonnegative(),
    startdate: z.coerce.number().int().nonnegative(),
    userid: z.coerce.number().int().positive()
  })
  .refine((payload) => payload.enddate >= payload.startdate, {
    message: 'enddate must be greater than or equal to startdate',
    path: ['enddate']
  })

type WithingsWebhookBody = Record<string, string>

export type ParsedWithingsWebhookBody = {
  fields: WithingsWebhookBody
  rawBody: string
}

type WithingsWebhookRequest = FastifyRequest<{
  Body: ParsedWithingsWebhookBody
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

async function storeWithingsWebhookEvent(rawBody: string, fields: WithingsWebhookBody) {
  const payload = withingsWeightWebhookPayloadSchema.parse(fields)

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

export async function handleWithingsWebhook(request: WithingsWebhookRequest, reply: FastifyReply) {
  if (isEmptyObject(request.body.fields)) {
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

    const event = await storeWithingsWebhookEvent(request.body.rawBody, request.body.fields)

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
