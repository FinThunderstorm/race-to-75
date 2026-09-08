import { createHash } from 'node:crypto'
import { z } from 'zod'

// Protocol reference: https://github.com/m4ary/eufylife-api-hacs
// These are public mobile-client identifiers, not a user's credentials.
const apiBase = 'https://api.eufylife.com'
const idSchema = z.union([z.string().min(1), z.number().int()]).transform(String)
const profileSchema = z.object({
  id: idSchema,
  name: z.string().nullish(),
  nick_name: z.string().nullish(),
  nickname: z.string().nullish()
})
const loginSchema = z.object({
  access_token: z.string().min(1),
  user_id: idSchema,
  expires_in: z.number().positive().default(2592000),
  customers: z.array(profileSchema).min(1)
})
const recordSchema = z.object({
  id: idSchema.optional(),
  customer_id: idSchema,
  device_id: idSchema.optional(),
  create_time: z.number().positive().optional(),
  update_time: z.number().positive().optional(),
  scale_data: z.object({ weight: z.number().positive() })
})

export type EufyProfile = { id: string; name: string }
export type EufyReading = { externalId: string; measuredAt: Date; weightKg: number }
export class EufyAuthError extends Error {
  constructor() {
    super('Eufy Life sign-in is required.')
  }
}
export class EufyServiceError extends Error {
  constructor() {
    super('Eufy Life is unavailable or returned an unexpected response. Try again later.')
  }
}

async function request(path: string, init: RequestInit, fetcher: typeof fetch) {
  try {
    const response = await fetcher(new URL(path, apiBase), {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000)
    })
    if (response.status === 401 || response.status === 403) {
      throw new EufyAuthError()
    }
    if (!response.ok) {
      throw new EufyServiceError()
    }
    const body = await response.json()
    const envelope = z.object({ res_code: z.number() }).parse(body)
    // The protocol uses application errors even with HTTP 200. Never expose
    // upstream messages: they may contain credentials or account data.
    if (envelope.res_code !== 1) {
      if (path.includes('/login') || envelope.res_code === -1 || envelope.res_code === 401) {
        throw new EufyAuthError()
      }
      throw new EufyServiceError()
    }
    return body
  } catch (error) {
    if (error instanceof EufyAuthError) {
      throw error
    }
    throw new EufyServiceError()
  }
}

export async function loginEufy(email: string, password: string, fetcher = fetch) {
  const body = await request(
    '/v1/user/v2/email/login',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'EufyLife-iOS-3.3.7',
        Category: 'Health',
        Language: 'en',
        Timezone: 'UTC',
        Country: 'US'
      },
      body: JSON.stringify({
        client_id: 'eufy-app',
        client_secret: '8FHf22gaTKu7MZXqz5zytw',
        email,
        password
      })
    },
    fetcher
  )
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    throw new EufyServiceError()
  }
  const data = parsed.data
  return {
    token: data.access_token,
    accountId: data.user_id,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    profiles: data.customers.map((profile) => ({
      id: profile.id,
      name: profile.name || profile.nick_name || profile.nickname || `Profile ${profile.id}`
    }))
  }
}

export function monthBefore(date: Date) {
  const result = new Date(date)
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() - 1)
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result
}

export async function fetchEufyReadings(
  accountId: string,
  token: string,
  profileId: string,
  from: Date,
  until: Date,
  fetcher = fetch
): Promise<EufyReading[]> {
  const body = await request(
    `/v1/device/data?after=${Math.floor(from.getTime() / 1000) - 1}`,
    {
      headers: { Uid: accountId, Token: token, 'User-Agent': 'Eufylife-iOS-3.3.7-281' }
    },
    fetcher
  )
  const parsed = z.object({ data: z.array(z.unknown()) }).safeParse(body)
  if (!parsed.success) {
    throw new EufyServiceError()
  }
  const readings: EufyReading[] = []
  for (const raw of parsed.data.data) {
    // Ignore other profiles and non-scale data, but fail visibly on malformed
    // weight records so a protocol change cannot silently lose measurements.
    if (
      !raw ||
      typeof raw !== 'object' ||
      !('customer_id' in raw) ||
      String(raw.customer_id) !== profileId
    ) {
      continue
    }
    if (!('scale_data' in raw) || !raw.scale_data) {
      continue
    }
    const record = recordSchema.safeParse(raw)
    if (!record.success) {
      throw new EufyServiceError()
    }
    const value = record.data
    const timestamp = value.create_time ?? value.update_time
    if (!timestamp) {
      throw new EufyServiceError()
    }
    const measuredAt = new Date(timestamp * 1000)
    const weightKg = value.scale_data.weight / 10
    if (Number.isNaN(measuredAt.getTime()) || weightKg >= 1000) {
      throw new EufyServiceError()
    }
    if (measuredAt < from || measuredAt > until) {
      continue
    }
    // Scope IDs to the account and profile. When no record ID is supplied,
    // use device + original timestamp (never weight, which can be corrected).
    const identity = JSON.stringify([
      accountId,
      profileId,
      value.id ?? [value.device_id ?? '', timestamp]
    ])
    readings.push({
      externalId: createHash('sha256').update(identity).digest('hex'),
      measuredAt,
      weightKg
    })
  }
  return readings
}
