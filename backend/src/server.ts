import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'

import { registerAdminRoutes } from './admin/index.js'
import { authPlugin } from './auth/index.js'
import { config } from './config.js'
import { closeDatabase } from './database.js'
import { registerEufyRoutes } from './integrations/eufy/index.js'
import { startEufySync } from './integrations/eufy/sync.js'
import {
  handleWithingsCallback,
  handleWithingsConnect,
  handleWithingsDisconnect,
  handleWithingsStatus,
  registerWithingsProfileRoutes
} from './integrations/withings/index.js'
import { handlePing } from './ping/handle-ping.js'
import { registerProfileRoutes } from './profile/index.js'
import { registerRaceRoutes } from './race/index.js'
import {
  handleWithingsWebhook,
  type ParsedWithingsWebhookBody,
  parseWithingsWebhookFormBody
} from './webhooks/withings/index.js'

const app = Fastify({
  trustProxy: config.trustProxy,
  logger: {
    redact: [
      'req.body.password',
      'req.body.email',
      'req.headers.token',
      'req.headers.authorization',
      'req.headers.cookie'
    ],
    serializers: {
      req(request) {
        // Enrollment and OAuth URLs contain credentials; omit query strings.
        return {
          method: request.method,
          url: request.url?.split('?')[0],
          hostname: request.hostname
        }
      }
    }
  }
})

app.addHook('onClose', async () => {
  await closeDatabase()
})

app.addContentTypeParser(
  'application/x-www-form-urlencoded',
  { parseAs: 'string' },
  parseWithingsWebhookFormBody
)

app.get('/ping', handlePing)
app.get('/integrations/withings/connect', handleWithingsConnect)
app.get('/integrations/withings/callback', handleWithingsCallback)
app.get('/integrations/withings/status', handleWithingsStatus)
app.delete('/integrations/withings', handleWithingsDisconnect)
app.post<{ Body: ParsedWithingsWebhookBody }>('/webhooks/withings', handleWithingsWebhook)

const here = dirname(fileURLToPath(import.meta.url))
const frontendDist = join(here, '..', '..', 'frontend', 'dist')

const start = async () => {
  await app.register(authPlugin)
  await registerAdminRoutes(app)
  await registerRaceRoutes(app)
  await registerProfileRoutes(app)
  await registerWithingsProfileRoutes(app)
  await registerEufyRoutes(app)
  if (config.eufySyncEnabled) {
    startEufySync(app)
  }

  if (existsSync(join(frontendDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: frontendDist })

    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        return reply.sendFile('index.html')
      }

      return reply.code(404).send({ message: 'Not Found' })
    })
  } else {
    app.log.warn(`Frontend build not found at ${frontendDist}; serving API only`)
  }

  await app.listen({ port: config.port, host: config.host })
}

start().catch((err) => {
  app.log.error(err)
  process.exit(1)
})
