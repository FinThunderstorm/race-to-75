import type { FastifyInstance } from 'fastify'

import { findUserById } from '../auth/queries.js'
import { sql } from '../database.js'
import { registerRadiatorRoutes } from './radiator.js'

export async function registerRaceRoutes(app: FastifyInstance) {
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
      measured_at: Date | null
      weight_kg: number | null
    }[]
  >`
      SELECT app_user.id, app_user.display_name, reading.measured_at,
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
      measurements: { measuredAt: string; weightKg: number }[]
    }
  >()

  for (const row of rows) {
    let participant = participants.get(row.id)
    if (!participant) {
      participant = { id: row.id, name: row.display_name, measurements: [] }
      participants.set(row.id, participant)
    }
    if (row.measured_at !== null && row.weight_kg !== null) {
      participant.measurements.push({
        measuredAt: row.measured_at.toISOString(),
        weightKg: row.weight_kg
      })
    }
  }

  return { participants: [...participants.values()] }
}
