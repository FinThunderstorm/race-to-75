import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { config } from '../../config.js'
import { EufyAuthError, EufyServiceError, loginEufy } from './client.js'
import {
  cancelSetup,
  connectionStatus,
  disconnect,
  queueSync,
  saveSetup,
  selectProfile
} from './queries.js'
import { syncEufy } from './sync.js'
import { encryptToken } from './token.js'

export async function registerEufyRoutes(app: FastifyInstance) {
  const options = {
    preHandler: app.auth([app.verifyJwt]),
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }
  app.get('/api/integrations/eufy/status', options, async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    return connectionStatus(request.user.sub)
  })
  app.post(
    '/api/integrations/eufy/login',
    {
      ...options,
      bodyLimit: 8192,
      // Even JSON-parser errors must not echo snippets of a password-bearing body.
      errorHandler(error, request, reply) {
        request.body = undefined
        reply.header('Cache-Control', 'no-store')
        const status =
          error.statusCode && error.statusCode >= 400 && error.statusCode < 500
            ? error.statusCode
            : 500
        return reply.code(status).send({
          error:
            status === 429
              ? 'Too many sign-in attempts. Try again in a minute.'
              : 'Could not sign in to Eufy Life. Please try again.'
        })
      }
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store')
      const input = z
        .object({ email: z.email().max(320), password: z.string().min(1).max(4096) })
        .safeParse(request.body)
      request.body = undefined
      if (!input.success) {
        return reply.code(400).send({ error: 'Enter your Eufy Life email and password.' })
      }
      try {
        const account = await loginEufy(input.data.email, input.data.password)
        const setupId = randomUUID()
        await saveSetup({
          user_id: request.user.sub,
          setup_id: setupId,
          access_token: encryptToken(account.token, request.user.sub, config.cookieSecret),
          account_id: account.accountId,
          profiles: account.profiles,
          token_expires_at: account.expiresAt
        })
        return { setupId, profiles: account.profiles }
      } catch (error) {
        return reply.code(error instanceof EufyAuthError ? 401 : 502).send({
          error:
            error instanceof EufyAuthError
              ? 'Eufy Life rejected sign-in. Check your email and password.'
              : new EufyServiceError().message
        })
      } finally {
        input.data.email = ''
        input.data.password = ''
      }
    }
  )
  app.post('/api/integrations/eufy/profile', options, async (request, reply) => {
    const input = z
      .object({ setupId: z.uuid(), profileId: z.string().min(1).max(256) })
      .safeParse(request.body)
    if (!input.success) {
      return reply.code(400).send({ error: 'Select a Eufy Life profile.' })
    }
    try {
      if (!(await selectProfile(request.user.sub, input.data.setupId, input.data.profileId))) {
        return reply
          .code(400)
          .send({ error: 'Profile selection expired or is invalid. Sign in to Eufy Life again.' })
      }
    } catch (error) {
      const conflict =
        typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
      return reply.code(conflict ? 409 : 500).send({
        error: conflict
          ? 'That Eufy profile is already connected to another race participant.'
          : 'Could not save the Eufy connection. Try again.'
      })
    }
    await syncEufy(request.user.sub)
    return connectionStatus(request.user.sub)
  })
  app.post('/api/integrations/eufy/sync', options, async (request, reply) => {
    if (!(await queueSync(request.user.sub))) {
      return reply.code(409).send({ error: 'Connect or reconnect Eufy Life before syncing.' })
    }
    await syncEufy(request.user.sub)
    return connectionStatus(request.user.sub)
  })
  app.delete('/api/integrations/eufy', options, async (request, reply) => {
    await disconnect(request.user.sub)
    return reply.code(204).send()
  })
  app.delete('/api/integrations/eufy/setup', options, async (request, reply) => {
    await cancelSetup(request.user.sub)
    return reply.code(204).send()
  })
}
