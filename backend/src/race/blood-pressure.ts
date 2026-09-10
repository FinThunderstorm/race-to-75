import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { findUserById } from '../auth/queries.js'
import { sql } from '../database.js'

const measurementBody = z
  .strictObject({
    measuredAt: z.iso
      .date()
      .refine((date) => date >= '0001-01-01' && date <= new Date().toISOString().slice(0, 10)),
    systolic: z.number().int().min(1).max(300),
    diastolic: z.number().int().min(1).max(300)
  })
  .refine(({ systolic, diastolic }) => systolic > diastolic)
type BloodPressureMeasurement = {
  id: string
  measuredAt: string
  systolic: number
  diastolic: number
}

export async function registerBloodPressureRoutes(app: FastifyInstance) {
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

  app.get('/api/blood-pressure-measurements', options, async (request) => {
    const measurements = await sql<BloodPressureMeasurement[]>`
      SELECT id, measured_at::text AS "measuredAt", systolic, diastolic
      FROM blood_pressure_measurement WHERE user_id = ${request.user.sub}
      ORDER BY measured_at DESC, created_at DESC, id DESC
    `
    return { measurements }
  })

  app.post('/api/blood-pressure-measurements', options, async (request, reply) => {
    const input = measurementBody.safeParse(request.body)
    if (!input.success) {
      return reply.code(400).send({
        error:
          'Enter whole-number pressures from 1–300 mmHg, systolic greater than diastolic, and a valid date no later than today (UTC).'
      })
    }
    const [measurement] = await sql<BloodPressureMeasurement[]>`
      INSERT INTO blood_pressure_measurement (user_id, measured_at, systolic, diastolic)
      SELECT id, ${input.data.measuredAt}::date, ${input.data.systolic}, ${input.data.diastolic}
      FROM users WHERE id = ${request.user.sub} AND disabled_at IS NULL
      RETURNING id, measured_at::text AS "measuredAt", systolic, diastolic
    `
    if (!measurement) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
    return reply.code(201).send(measurement)
  })

  app.delete<{ Params: { id: string } }>(
    '/api/blood-pressure-measurements/:id',
    options,
    async (request, reply) => {
      if (!z.uuid().safeParse(request.params.id).success) {
        return reply.code(400).send({ error: 'Invalid measurement ID' })
      }
      const deleted = await sql`
      DELETE FROM blood_pressure_measurement
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
