import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { z } from 'zod'

export type SessionUser = {
  sub: string
  role: 'admin' | 'member'
}

export const enrollOptionsBodySchema = z.object({
  token: z.string().min(1)
})

export const enrollVerifyBodySchema = z.object({
  token: z.string().min(1),
  response: z.custom<RegistrationResponseJSON>(
    (value) => typeof value === 'object' && value !== null
  ),
  deviceName: z.string().min(1).max(100).optional()
})

export const loginVerifyBodySchema = z.object({
  response: z.custom<AuthenticationResponseJSON>(
    (value) => typeof value === 'object' && value !== null
  )
})

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: SessionUser
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    verifyJwt: (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply
    ) => Promise<void>
  }
}
