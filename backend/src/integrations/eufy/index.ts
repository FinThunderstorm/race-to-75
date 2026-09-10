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
              ? 'Liian monta kirjautumisyritystä. Yritä uudelleen minuutin kuluttua.'
              : 'Eufy Lifeen kirjautuminen epäonnistui. Yritä uudelleen.'
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
        return reply.code(400).send({ error: 'Anna Eufy Life -sähköpostisi ja -salasanasi.' })
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
              ? 'Eufy Life hylkäsi kirjautumisen. Tarkista sähköpostisi ja salasanasi.'
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
      return reply.code(400).send({ error: 'Valitse Eufy Life -profiili.' })
    }
    try {
      if (!(await selectProfile(request.user.sub, input.data.setupId, input.data.profileId))) {
        return reply.code(400).send({
          error:
            'Profiilin valinta on vanhentunut tai virheellinen. Kirjaudu Eufy Lifeen uudelleen.'
        })
      }
    } catch (error) {
      const conflict =
        typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
      return reply.code(conflict ? 409 : 500).send({
        error: conflict
          ? 'Tämä Eufy-profiili on jo yhdistetty toiseen kisaajaan.'
          : 'Eufy-yhteyden tallentaminen epäonnistui. Yritä uudelleen.'
      })
    }
    await syncEufy(request.user.sub)
    return connectionStatus(request.user.sub)
  })
  app.post('/api/integrations/eufy/sync', options, async (request, reply) => {
    if (!(await queueSync(request.user.sub))) {
      return reply
        .code(409)
        .send({ error: 'Yhdistä Eufy Life tai muodosta yhteys uudelleen ennen synkronointia.' })
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
