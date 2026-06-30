import { z } from 'zod'

export const withingsWebhookApplicationSchema = z.object({
  appli: z.coerce.number().int().positive()
})

export const withingsWeightWebhookPayloadSchema = z
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

export type WithingsWebhookBody = Record<string, string>

type StoredWithingsWebhookEvent = {
  id: string
  status: string
}

export type WithingsWeightWebhookPayload = z.infer<typeof withingsWeightWebhookPayloadSchema>

export type StoreWithingsWebhookEvent = (
  rawBody: string,
  payload: WithingsWeightWebhookPayload
) => Promise<StoredWithingsWebhookEvent>

export type ParsedWithingsWebhookBody = {
  fields: WithingsWebhookBody
  rawBody: string
}
