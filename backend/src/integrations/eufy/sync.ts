import type { FastifyInstance } from 'fastify'

import { config } from '../../config.js'
import { EufyAuthError, EufyServiceError, fetchEufyReadings, lookbackStart } from './client.js'
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
      // Refetch the whole window every time so late uploads and short outages
      // land; readings that aged out of it are already stored from earlier syncs.
      const now = new Date()
      const readings = await fetchEufyReadings(
        connection.account_id,
        token,
        connection.profile_id,
        lookbackStart(now),
        now
      )
      await finishSync(connection, readings)
    } catch (error) {
      await finishSync(
        connection,
        [],
        error instanceof EufyAuthError
          ? 'Yhdistä Eufy Life uudelleen jatkaaksesi mittausten tuontia.'
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
