import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { config } from '../config.js'
import { AdminError, listUsers, manageUser } from './queries.js'

const email = z.string().trim().max(254).pipe(z.email())
const displayName = z.string().trim().min(1).max(100)
const createSchema = z.strictObject({ email, display_name: displayName })
const updateSchema = z
  .strictObject({
    email: email.optional(),
    display_name: displayName.optional(),
    role: z.enum(['admin', 'member']).optional(),
    disabled: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one change')
const paramsSchema = z.object({ id: z.uuid() })

export async function registerAdminRoutes(app: FastifyInstance) {
  await app.register(async (admin) => {
    admin.addHook('onRequest', async (_request, reply) => {
      reply.header('Cache-Control', 'no-store')
    })
    admin.addHook('preHandler', app.verifyJwt)
    admin.addHook('preHandler', async (request, reply) => {
      // verifyJwt refreshes this role from the database on every request.
      if (request.user.role !== 'admin') {
        return reply.code(403).send({ error: 'Admin access required' })
      }
      if (request.method !== 'GET') {
        const origin = request.headers.origin
        if (
          (origin !== undefined && origin !== new URL(config.webauthnOrigin).origin) ||
          request.headers['sec-fetch-site'] === 'cross-site'
        ) {
          return reply.code(403).send({ error: 'Request origin is not allowed' })
        }
      }
    })
    admin.setErrorHandler((error, request, reply) => {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Enter a valid email, name, and account settings' })
      }
      if (error instanceof AdminError) {
        return reply.code(error.statusCode).send({ error: error.message })
      }
      if (error instanceof Error && 'statusCode' in error && error.statusCode === 400) {
        return reply.code(400).send({ error: 'Invalid request' })
      }
      request.log.error({ err: error }, 'User management failed')
      return reply.code(500).send({ error: 'Could not manage users. Please try again.' })
    })
    admin.get('/api/admin/users', async () => ({ users: await listUsers() }))
    admin.post('/api/admin/users', async (request, reply) => {
      const input = createSchema.parse(request.body)
      const result = await manageUser(request.user.sub, { type: 'create', ...input })
      return reply.code(201).send(result)
    })
    admin.patch('/api/admin/users/:id', async (request) => {
      const { id } = paramsSchema.parse(request.params)
      return manageUser(request.user.sub, {
        type: 'update',
        id,
        changes: updateSchema.parse(request.body)
      })
    })
    admin.post('/api/admin/users/:id/enrollment', async (request, reply) => {
      const { id } = paramsSchema.parse(request.params)
      const result = await manageUser(request.user.sub, { type: 'enrollment', id })
      return reply.code(201).send(result)
    })
  })
}
