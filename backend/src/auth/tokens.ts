import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

export type ChallengePayload = {
  challenge: string
  type: 'enroll' | 'login'
  userId?: string
  exp: number
}

const challengePayloadSchema = z.object({
  challenge: z.string().min(1),
  type: z.enum(['enroll', 'login']),
  userId: z.string().min(1).optional(),
  exp: z.number().int().positive()
})

export function hashEnrollmentToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

export function generateEnrollmentToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('base64url')

  return { rawToken, tokenHash: hashEnrollmentToken(rawToken) }
}

export function isEnrollmentTokenUsable(
  row: { consumedAt: Date | null; expiresAt: Date },
  now: Date
): boolean {
  return row.consumedAt === null && row.expiresAt.getTime() > now.getTime()
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

export function signChallenge(payload: ChallengePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return `${body}.${sign(body, secret)}`
}

export function verifyChallenge(value: string, secret: string, now: Date): ChallengePayload {
  const [body, signature] = value.split('.')

  if (!body || !signature) {
    throw new Error('Malformed challenge token')
  }

  const expected = sign(body, secret)
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid challenge signature')
  }

  const payload = challengePayloadSchema.parse(
    JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  )

  if (payload.exp < Math.floor(now.getTime() / 1000)) {
    throw new Error('Expired challenge token')
  }

  return payload
}
