import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { sql } from '../database.js'

// Practical data-entry bounds, not medical thresholds.
const profileBody = z.strictObject({
  heightCm: z.number().min(50).max(300).multipleOf(0.1).nullable()
})

export async function registerProfileRoutes(app: FastifyInstance) {
  const options = {
    onRequest: async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store')
    },
    preHandler: app.auth([app.verifyJwt])
  }

  app.get('/api/profile', options, async (request, reply) => {
    const [profile] = await sql<{ heightCm: number | null }[]>`
      SELECT height_cm::float8 AS "heightCm" FROM users
      WHERE id = ${request.user.sub} AND disabled_at IS NULL
    `
    if (!profile) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
    return profile
  })

  app.put('/api/profile', options, async (request, reply) => {
    const input = profileBody.safeParse(request.body)
    if (!input.success) {
      return reply.code(400).send({
        error: 'Enter a height from 50 to 300 cm with at most one decimal, or clear it.'
      })
    }
    const [profile] = await sql<{ heightCm: number | null }[]>`
      UPDATE users SET height_cm = ${input.data.heightCm}
      WHERE id = ${request.user.sub} AND disabled_at IS NULL
      RETURNING height_cm::float8 AS "heightCm"
    `
    if (!profile) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
    return profile
  })
}
