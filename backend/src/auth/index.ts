import fastifyAuth from '@fastify/auth'
import fastifyCookie from '@fastify/cookie'
import fastifyJwt from '@fastify/jwt'
import fastifyRateLimit from '@fastify/rate-limit'
import type { FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

import { config } from '../config.js'
import {
  consumeEnrollmentTokenAndInsertCredential,
  findCredentialById,
  findCredentialsByUser,
  findUserByEnrollmentTokenHash,
  findUserById,
  updateCredentialCounter
} from './queries.js'
import {
  hashEnrollmentToken,
  isEnrollmentTokenUsable,
  signChallenge,
  verifyChallenge
} from './tokens.js'
import {
  enrollOptionsBodySchema,
  enrollVerifyBodySchema,
  loginVerifyBodySchema,
  type SessionUser
} from './types.js'
import {
  buildAuthenticationOptions,
  buildRegistrationOptions,
  verifyAuthentication,
  verifyRegistration
} from './webauthn.js'

const errorDetails = (error: unknown) => {
  if (error instanceof Error) {
    return { message: error.message, name: error.name }
  }

  return { message: String(error) }
}

export const authPlugin = fp(async (app) => {
  await app.register(fastifyCookie, { secret: config.cookieSecret })
  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: 'session', signed: false }
  })
  await app.register(fastifyAuth)
  await app.register(fastifyRateLimit, { global: false })

  app.decorate('verifyJwt', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch (error) {
      request.log.info({ error: errorDetails(error) }, 'JWT verification failed')
      await reply.code(401).send({ error: 'Unauthorized' })
      throw error
    }
  })

  const enrollChallengeCookie = 'r2_enroll_challenge'
  const loginChallengeCookie = 'r2_login_challenge'
  const strictAuthLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }

  const issueSession = (reply: FastifyReply, user: SessionUser) => {
    const token = app.jwt.sign(user, { expiresIn: config.sessionTtlSeconds })

    reply.setCookie('session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
      maxAge: config.sessionTtlSeconds
    })
  }

  app.get('/api/auth/me', { preHandler: app.auth([app.verifyJwt]) }, async (request, reply) => {
    const user = await findUserById(request.user.sub)

    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    return user
  })

  app.post('/api/auth/enroll/options', strictAuthLimit, async (request, reply) => {
    try {
      const { token } = enrollOptionsBodySchema.parse(request.body)
      const tokenHash = hashEnrollmentToken(token)
      const user = await findUserByEnrollmentTokenHash(tokenHash)

      if (!user || !isEnrollmentTokenUsable(user, new Date())) {
        return reply.code(400).send({ error: 'Invalid or expired enrollment link' })
      }

      const existing = await findCredentialsByUser(user.userId)
      const options = await buildRegistrationOptions({
        userId: user.userId,
        email: user.email,
        excludeCredentials: existing.map((credential) => ({
          id: credential.credentialId,
          transports: credential.transports
        }))
      })

      reply.setCookie(
        enrollChallengeCookie,
        signChallenge(
          {
            challenge: options.challenge,
            type: 'enroll',
            userId: user.userId,
            exp: Math.floor(Date.now() / 1000) + 300
          },
          config.cookieSecret
        ),
        { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/', maxAge: 300 }
      )

      return options
    } catch (error) {
      request.log.warn({ error: errorDetails(error) }, 'Enrollment options request failed')

      return reply.code(400).send({ error: 'Invalid or expired enrollment link' })
    }
  })

  app.post('/api/auth/enroll/verify', strictAuthLimit, async (request, reply) => {
    try {
      const body = enrollVerifyBodySchema.parse(request.body)
      const rawChallenge = request.cookies[enrollChallengeCookie]

      if (!rawChallenge) {
        return reply.code(400).send({ error: 'Missing challenge' })
      }

      const challenge = verifyChallenge(rawChallenge, config.cookieSecret, new Date())

      if (challenge.type !== 'enroll' || !challenge.userId) {
        return reply.code(400).send({ error: 'Invalid challenge' })
      }

      const tokenHash = hashEnrollmentToken(body.token)
      const user = await findUserByEnrollmentTokenHash(tokenHash)

      if (!user || user.userId !== challenge.userId || !isEnrollmentTokenUsable(user, new Date())) {
        return reply.code(400).send({ error: 'Invalid or expired enrollment link' })
      }

      const registration = await verifyRegistration({
        response: body.response,
        expectedChallenge: challenge.challenge
      })

      await consumeEnrollmentTokenAndInsertCredential({
        tokenHash,
        userId: user.userId,
        credentialId: registration.credentialId,
        publicKey: registration.publicKey,
        counter: registration.counter,
        transports: registration.transports,
        deviceName: body.deviceName ?? null
      })

      reply.clearCookie(enrollChallengeCookie, { path: '/' })

      issueSession(reply, { sub: user.userId, role: user.role })

      return { ok: true }
    } catch (error) {
      request.log.warn({ error: errorDetails(error) }, 'Enrollment verification failed')

      return reply.code(400).send({ error: 'Invalid or expired enrollment link' })
    }
  })

  app.post('/api/auth/login/options', strictAuthLimit, async (_request, reply) => {
    const options = await buildAuthenticationOptions()

    reply.setCookie(
      loginChallengeCookie,
      signChallenge(
        { challenge: options.challenge, type: 'login', exp: Math.floor(Date.now() / 1000) + 300 },
        config.cookieSecret
      ),
      { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/', maxAge: 300 }
    )

    return options
  })

  app.post('/api/auth/login/verify', strictAuthLimit, async (request, reply) => {
    try {
      const body = loginVerifyBodySchema.parse(request.body)
      const rawChallenge = request.cookies[loginChallengeCookie]

      if (!rawChallenge) {
        return reply.code(400).send({ error: 'Missing challenge' })
      }

      const challenge = verifyChallenge(rawChallenge, config.cookieSecret, new Date())

      if (challenge.type !== 'login') {
        return reply.code(400).send({ error: 'Invalid challenge' })
      }

      const credential = await findCredentialById(body.response.id)

      if (!credential) {
        return reply.code(400).send({ error: 'Unknown credential' })
      }

      const result = await verifyAuthentication({
        response: body.response,
        expectedChallenge: challenge.challenge,
        credential: {
          id: body.response.id,
          publicKey: credential.publicKey,
          counter: credential.counter,
          transports: credential.transports
        }
      })

      await updateCredentialCounter(body.response.id, result.newCounter)
      reply.clearCookie(loginChallengeCookie, { path: '/' })
      issueSession(reply, { sub: credential.userId, role: credential.role })

      return { ok: true }
    } catch (error) {
      request.log.warn({ error: errorDetails(error) }, 'Login verification failed')

      return reply.code(400).send({ error: 'Login failed' })
    }
  })

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie('session', { path: '/' })

    return { ok: true }
  })
})
