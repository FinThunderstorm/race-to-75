import Fastify from 'fastify'

import { config } from './config.js'
import { closeDatabase } from './database.js'
import { handlePing } from './ping/handle-ping.js'
import {
  handleWithingsWebhook,
  type ParsedWithingsWebhookBody,
  parseWithingsWebhookFormBody
} from './webhooks/handle-withings-webhook.js'

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
app.post<{ Body: ParsedWithingsWebhookBody }>('/webhooks/withings', handleWithingsWebhook)

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
