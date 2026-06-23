import Fastify from 'fastify'

import { config } from './config.js'
import { closeDatabase } from './database.js'
import {
  handleWithingsCallback,
  handleWithingsConnect,
  handleWithingsDisconnect,
  handleWithingsStatus
} from './integrations/withings/index.js'
import { handlePing } from './ping/handle-ping.js'
import {
  handleWithingsWebhook,
  type ParsedWithingsWebhookBody,
  parseWithingsWebhookFormBody
} from './webhooks/withings/index.js'

const app = Fastify({ logger: true })

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

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
