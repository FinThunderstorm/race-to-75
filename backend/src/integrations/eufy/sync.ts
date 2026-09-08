import type { FastifyInstance } from 'fastify'

import { config } from '../../config.js'
import { EufyAuthError, EufyServiceError, fetchEufyReadings } from './client.js'
import { claimSync, finishSync, removeExpiredSetups } from './queries.js'
import { decryptToken } from './token.js'

export async function syncEufy(userId?: string) {
  for (let count = 0; count < (userId ? 1 : 20); count++) {
    const connection = await claimSync(userId)
    if (!connection) {
      return
    }
    try {
      if (connection.expires_at <= new Date()) {
        throw new EufyAuthError()
      }
      let token: string
      try {
        token = decryptToken(connection.access_token, connection.user_id, config.cookieSecret)
      } catch {
        throw new EufyAuthError()
      }
      // Fetch from the original boundary to recover late uploads and outages,
      // including gaps longer than a month when the user reconnects.
      const readings = await fetchEufyReadings(
        connection.account_id,
        token,
        connection.profile_id,
        connection.import_from,
        new Date()
      )
      await finishSync(connection, readings)
    } catch (error) {
      await finishSync(
        connection,
        [],
        error instanceof EufyAuthError
          ? 'Reconnect Eufy Life to resume importing.'
          : new EufyServiceError().message,
        error instanceof EufyAuthError
      )
    }
  }
}

export function startEufySync(app: FastifyInstance) {
  let running: Promise<void> | undefined
  const tick = () => {
    if (running) {
      return
    }
    running = (async () => {
      await removeExpiredSetups()
      await syncEufy()
    })()
      .catch(() => {
        app.log.error('Eufy sync worker failed; will retry on the next tick')
      })
      .finally(() => {
        running = undefined
      })
  }
  const timer = setInterval(tick, 60_000)
  timer.unref()
  tick()
  app.addHook('preClose', async () => {
    clearInterval(timer)
    await running
  })
}
