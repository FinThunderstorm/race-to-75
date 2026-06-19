import { z } from 'zod'

export const withingsMeasureResponseSchema = z.object({
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

export const withingsRefreshTokenResponseSchema = z.object({
  body: z.object({
    access_token: z.string().min(1),
    expires_in: z.number().int().positive(),
    refresh_token: z.string().min(1),
    userid: z.union([z.string(), z.number()]).optional()
  }),
  status: z.number().int()
})

export type WithingsWebhookEvent = {
  attempts: number
  end_at: Date
  id: string
  start_at: Date
  withings_userid: string
}

export type IntegrationConnection = {
  access_token: string
  expires_at: Date | null
  id: string
  refresh_token: string | null
  user_id: string
}

export type WithingsMeasurementFetchWindow = {
  end_at: Date
  start_at: Date
}

export type WithingsMeasurement = {
  externalId: string
  measuredAt: Date
  weightKg: number
}
