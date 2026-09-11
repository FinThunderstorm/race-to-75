import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { findUserById } from '../auth/queries.js'
import { sql } from '../database.js'

const lift = z.number().min(0.1).max(1000).multipleOf(0.1)
const measurementBody = z.strictObject({
  measuredAt: z.iso
    .date()
    .refine((date) => date >= '0001-01-01' && date <= new Date().toISOString().slice(0, 10)),
  squatKg: lift,
  benchKg: lift,
  deadliftKg: lift,
  bodyweightKg: z.number().min(1).max(500).multipleOf(0.1)
})
export type SbdMeasurement = z.infer<typeof measurementBody>
type StoredSbdMeasurement = SbdMeasurement & { id: string }

export async function registerSbdRoutes(app: FastifyInstance) {
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

  app.get('/api/sbd-measurements', options, async (request) => {
    const measurements = await sql<StoredSbdMeasurement[]>`
      SELECT id, measured_at::text AS "measuredAt", squat_kg::float8 AS "squatKg",
        bench_kg::float8 AS "benchKg", deadlift_kg::float8 AS "deadliftKg",
        bodyweight_kg::float8 AS "bodyweightKg"
      FROM sbd_measurement WHERE user_id = ${request.user.sub}
      ORDER BY measured_at DESC, created_at DESC, id DESC
    `
    return { measurements }
  })

  app.post('/api/sbd-measurements', options, async (request, reply) => {
    const input = measurementBody.safeParse(request.body)
    if (!input.success) {
      return reply.code(400).send({
        error:
          'Enter each lift from 0.1–1000 kg and body weight from 1–500 kg with at most one decimal, and a valid date no later than today (UTC).'
      })
    }
    const [measurement] = await sql<StoredSbdMeasurement[]>`
      INSERT INTO sbd_measurement (user_id, measured_at, squat_kg, bench_kg, deadlift_kg, bodyweight_kg)
      SELECT id, ${input.data.measuredAt}::date, ${input.data.squatKg}, ${input.data.benchKg},
        ${input.data.deadliftKg}, ${input.data.bodyweightKg}
      FROM users WHERE id = ${request.user.sub} AND disabled_at IS NULL AND sex IN ('male', 'female')
      RETURNING id, measured_at::text AS "measuredAt", squat_kg::float8 AS "squatKg",
        bench_kg::float8 AS "benchKg", deadlift_kg::float8 AS "deadliftKg",
        bodyweight_kg::float8 AS "bodyweightKg"
    `
    if (!measurement) {
      if (!(await findUserById(request.user.sub))) {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
      return reply
        .code(400)
        .send({ error: 'Save male or female sex in your profile before adding SBD measurements.' })
    }
    return reply.code(201).send(measurement)
  })

  app.delete<{ Params: { id: string } }>(
    '/api/sbd-measurements/:id',
    options,
    async (request, reply) => {
      if (!z.uuid().safeParse(request.params.id).success) {
        return reply.code(400).send({ error: 'Invalid measurement ID' })
      }
      const deleted = await sql`
      DELETE FROM sbd_measurement
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
