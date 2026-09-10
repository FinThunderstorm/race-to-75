import type { FastifyInstance } from 'fastify'

import { findUserById } from '../auth/queries.js'
import { sql } from '../database.js'
import { registerBicepsRoutes } from './biceps.js'
import { registerRadiatorRoutes } from './radiator.js'

export async function registerRaceRoutes(app: FastifyInstance) {
  await registerBicepsRoutes(app)
  app.get('/api/race', { preHandler: app.auth([app.verifyJwt]) }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store')

    if (!(await findUserById(request.user.sub))) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    return loadRace()
  })
  registerRadiatorRoutes(app, loadRace)
}

async function loadRace() {
  const rows = await sql<
    {
      id: string
      display_name: string
      height_cm: number | null
      measured_at: Date | null
      weight_kg: number | null
    }[]
  >`
      SELECT app_user.id, app_user.display_name, reading.measured_at,
        app_user.height_cm::float8 AS height_cm,
        reading.weight_kg::float8 AS weight_kg
      FROM users app_user
      LEFT JOIN measurement reading
        ON reading.user_id = app_user.id
      ORDER BY app_user.created_at, app_user.id, reading.measured_at, reading.id
    `
  const participants = new Map<
    string,
    {
      id: string
      name: string
      heightCm: number | null
      measurements: { measuredAt: string; weightKg: number }[]
      bicepsMeasurements: { measuredAt: string; circumferenceCm: number }[]
    }
  >()

  for (const row of rows) {
    let participant = participants.get(row.id)
    if (!participant) {
      participant = {
        id: row.id,
        name: row.display_name,
        heightCm: row.height_cm,
        measurements: [],
        bicepsMeasurements: []
      }
      participants.set(row.id, participant)
    }
    if (row.measured_at !== null && row.weight_kg !== null) {
      participant.measurements.push({
        measuredAt: row.measured_at.toISOString(),
        weightKg: row.weight_kg
      })
    }
  }

  const biceps = await sql<{ user_id: string; measured_at: string; circumference_cm: number }[]>`
    SELECT user_id, measured_at::text, circumference_cm::float8
    FROM biceps_measurement ORDER BY measured_at, created_at, id
  `
  for (const reading of biceps) {
    participants.get(reading.user_id)?.bicepsMeasurements.push({
      measuredAt: reading.measured_at,
      circumferenceCm: reading.circumference_cm
    })
  }
  return { participants: [...participants.values()] }
}
