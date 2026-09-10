import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { findUserById } from '../auth/queries.js'
import { sql } from '../database.js'

const measurementBody = z.strictObject({
  measuredAt: z.iso
    .date()
    .refine((date) => date >= '0001-01-01' && date <= new Date().toISOString().slice(0, 10)),
  circumferenceCm: z.number().min(1).max(100).multipleOf(0.1)
})
type BicepsMeasurement = { id: string; measuredAt: string; circumferenceCm: number }

export async function registerBicepsRoutes(app: FastifyInstance) {
  const options = {
    onRequest: async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store')
    },
    preHandler: [
      app.auth([app.verifyJwt]),
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (!(await findUserById(request.user.sub))) {
          return reply.code(401).send({ error: 'Unauthorized' })
        }
      }
    ]
  }

  app.get('/api/biceps-measurements', options, async (request) => {
    const measurements = await sql<BicepsMeasurement[]>`
      SELECT id, measured_at::text AS "measuredAt", circumference_cm::float8 AS "circumferenceCm"
      FROM biceps_measurement WHERE user_id = ${request.user.sub}
      ORDER BY measured_at DESC, created_at DESC, id DESC
    `
    return { measurements }
  })

  app.post('/api/biceps-measurements', options, async (request, reply) => {
    const input = measurementBody.safeParse(request.body)
    if (!input.success) {
      return reply.code(400).send({
        error: 'Enter 1–100 cm with at most one decimal and a valid date no later than today (UTC).'
      })
    }
    const [measurement] = await sql<BicepsMeasurement[]>`
      INSERT INTO biceps_measurement (user_id, measured_at, circumference_cm)
      SELECT id, ${input.data.measuredAt}::date, ${input.data.circumferenceCm}
      FROM users WHERE id = ${request.user.sub} AND disabled_at IS NULL
      RETURNING id, measured_at::text AS "measuredAt", circumference_cm::float8 AS "circumferenceCm"
    `
    if (!measurement) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
    return reply.code(201).send(measurement)
  })

  app.delete<{ Params: { id: string } }>(
    '/api/biceps-measurements/:id',
    options,
    async (request, reply) => {
      if (!z.uuid().safeParse(request.params.id).success) {
        return reply.code(400).send({ error: 'Invalid measurement ID' })
      }
      const deleted = await sql`
      DELETE FROM biceps_measurement
      WHERE id = ${request.params.id} AND user_id = ${request.user.sub}
        AND EXISTS (SELECT 1 FROM users WHERE id = ${request.user.sub} AND disabled_at IS NULL)
      RETURNING id
    `
      if (!deleted.length) {
        return reply.code(404).send({ error: 'Measurement not found' })
      }
      return reply.code(204).send()
    }
  )
}
