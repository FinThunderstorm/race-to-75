import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import fastifyStatic from '@fastify/static'
import { test as base } from '@playwright/test'
import Fastify, { type FastifyInstance } from 'fastify'
import postgres from 'postgres'

import type { Config } from '../backend/src/config'

const execFileAsync = promisify(execFile)
const root = resolve(__dirname, '..')
type Application = {
  app: FastifyInstance
  sql: postgres.Sql
  config: Config
  url: string
  databaseUrl: string
}
type Account = { id: string; email: string; displayName: string }

// Each worker owns a migrated database. Singleton settings, bootstrap checks and
// provider queues therefore cannot affect unrelated tests running concurrently.
export const test = base.extend<
  { signIn: (role?: 'member' | 'admin') => Promise<Account> },
  { application: Application }
>({
  application: [
    async ({}, use) => {
      const originalEnv = { ...process.env }
      const sourceUrl =
        process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/race_to_75'
      const control = postgres(sourceUrl, { max: 1, onnotice: () => undefined })
      const name = `race_test_${randomUUID().replaceAll('-', '')}`
      const database = new URL(sourceUrl)
      database.pathname = `/${name}`
      const databaseUrl = database.toString()
      let app: FastifyInstance | undefined
      let closeDatabase: (() => Promise<void>) | undefined
      let created = false
      try {
        await control`CREATE DATABASE ${control(name)}`
        created = true
        Object.assign(process.env, {
          DATABASE_URL: databaseUrl,
          JWT_SECRET: 'race-to-75-test-development',
          COOKIE_SECRET: 'race-to-75-test-development',
          WEBAUTHN_RP_ID: 'localhost',
          WEBAUTHN_ORIGIN: 'http://localhost',
          RADIATOR_ALLOWED_IP: '127.0.0.1',
          EUFY_SYNC_ENABLED: 'false'
        })
        await execFileAsync(process.execPath, ['backend/scripts/migrate.js'], {
          cwd: root,
          env: process.env
        })
        // Defer Playwright's CommonJS loader until DATABASE_URL is set. Dynamic
        // import would hand transformed TypeScript to Node's incompatible ESM loader.
        const { config } = require('../backend/src/config')
        const databaseModule = require('../backend/src/database')
        closeDatabase = databaseModule.closeDatabase
        const { authPlugin } = require('../backend/src/auth/index')
        const { registerAdminRoutes } = require('../backend/src/admin/index')
        const { registerRaceRoutes } = require('../backend/src/race/index')
        const { registerProfileRoutes } = require('../backend/src/profile/index')
        const { registerEufyRoutes } = require('../backend/src/integrations/eufy/index')
        const withings = require('../backend/src/integrations/withings/index')
        const webhook = require('../backend/src/webhooks/withings/index')
        app = Fastify()
        app.addContentTypeParser(
          'application/x-www-form-urlencoded',
          { parseAs: 'string' },
          webhook.parseWithingsWebhookFormBody
        )
        await app.register(authPlugin)
        await registerAdminRoutes(app)
        await registerRaceRoutes(app)
        await registerProfileRoutes(app)
        await registerEufyRoutes(app)
        await withings.registerWithingsProfileRoutes(app)
        app.get('/integrations/withings/connect', withings.handleWithingsConnect)
        app.get('/integrations/withings/callback', withings.handleWithingsCallback)
        app.get('/integrations/withings/status', withings.handleWithingsStatus)
        app.delete('/integrations/withings', withings.handleWithingsDisconnect)
        app.post('/webhooks/withings', webhook.handleWithingsWebhook)
        await app.register(fastifyStatic, { root: resolve(root, 'frontend/dist') })
        app.setNotFoundHandler((request, reply) => {
          if (request.method === 'GET' && !request.url.startsWith('/api')) {
            return reply.sendFile('index.html')
          }
          return reply.code(404).send({ error: 'Not found' })
        })
        const url = (await app.listen({ port: 0, host: '127.0.0.1' })).replace(
          '127.0.0.1',
          'localhost'
        )
        Object.assign(config, { webauthnOrigin: url, cookieSecure: false })
        await use({ app, sql: databaseModule.sql, config, url, databaseUrl })
      } finally {
        const cleanupErrors: unknown[] = []
        // Attempt every cleanup in order, even if a close hook rejects.
        for (const cleanup of [
          () => app?.close(),
          () => closeDatabase?.(),
          async () => {
            if (created) {
              await control`DROP DATABASE ${control(name)} WITH (FORCE)`
            }
          },
          () => control.end()
        ]) {
          try {
            await cleanup()
          } catch (error) {
            cleanupErrors.push(error)
          }
        }
        for (const key of Object.keys(process.env)) {
          if (!(key in originalEnv)) {
            delete process.env[key]
          }
        }
        Object.assign(process.env, originalEnv)
        if (cleanupErrors.length) {
          throw new AggregateError(cleanupErrors, 'Application fixture cleanup failed')
        }
      }
    },
    { scope: 'worker', timeout: 60_000 }
  ],
  baseURL: async ({ application }, use) => use(application.url),
  signIn: async ({ application, context }, use) => {
    const ids: string[] = []
    try {
      await use(async (role = 'member') => {
        const id = randomUUID()
        const account = { id, email: `${id}@example.com`, displayName: 'Journey Racer' }
        await application.sql`
          INSERT INTO users (id, email, display_name, role)
          VALUES (${id}, ${account.email}, ${account.displayName}, ${role})
        `
        ids.push(id)
        await context.addCookies([
          {
            name: 'session',
            value: application.app.jwt.sign({ sub: id, role }),
            url: application.url,
            httpOnly: true
          }
        ])
        return account
      })
    } finally {
      if (ids.length) {
        await application.sql`DELETE FROM users WHERE id IN ${application.sql(ids)}`
      }
    }
  }
})

export { expect } from '@playwright/test'
