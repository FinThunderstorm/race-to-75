import { randomUUID } from 'node:crypto'

import { sql } from '../../database.js'
import type { EufyProfile, EufyReading } from './client.js'

type Setup = {
  user_id: string
  setup_id: string
  access_token: string
  account_id: string
  profiles: EufyProfile[]
  token_expires_at: Date
}
export type SyncConnection = {
  id: string
  user_id: string
  access_token: string
  expires_at: Date
  account_id: string
  profile_id: string
  lease_id: string
}

export async function saveSetup(setup: Setup) {
  await sql`
    INSERT INTO eufy_setup (user_id, setup_id, access_token, account_id, profiles, token_expires_at)
    VALUES (${setup.user_id}, ${setup.setup_id}, ${setup.access_token}, ${setup.account_id},
      ${sql.json(setup.profiles)}, ${setup.token_expires_at})
    ON CONFLICT (user_id) DO UPDATE SET setup_id = EXCLUDED.setup_id,
      access_token = EXCLUDED.access_token, account_id = EXCLUDED.account_id,
      profiles = EXCLUDED.profiles, token_expires_at = EXCLUDED.token_expires_at,
      expires_at = now() + interval '10 minutes'
  `
}

export async function selectProfile(userId: string, setupId: string, profileId: string) {
  return sql.begin(async (tx) => {
    const [setup] = await tx<Setup[]>`
      SELECT * FROM eufy_setup WHERE user_id = ${userId} AND setup_id = ${setupId}
        AND expires_at > now() AND token_expires_at > now() FOR UPDATE
    `
    const profile = setup?.profiles.find((item) => item.id === profileId)
    if (!setup || !profile) {
      return false
    }
    const externalId = JSON.stringify([setup.account_id, profile.id])
    const [connection] = await tx<{ id: string }[]>`
      INSERT INTO integration_connection (user_id, provider, access_token, expires_at, status, external_user_id)
      VALUES (${userId}, 'eufy', ${setup.access_token}, ${setup.token_expires_at}, 'active', ${externalId})
      ON CONFLICT (user_id, provider) DO UPDATE SET access_token = EXCLUDED.access_token,
        expires_at = EXCLUDED.expires_at, status = 'active', external_user_id = EXCLUDED.external_user_id
      RETURNING id
    `
    await tx`
      INSERT INTO eufy_sync (connection_id, account_id, profile_id, profile_name)
      VALUES (${connection.id}, ${setup.account_id}, ${profile.id}, ${profile.name})
      ON CONFLICT (connection_id) DO UPDATE SET account_id = EXCLUDED.account_id,
        profile_id = EXCLUDED.profile_id, profile_name = EXCLUDED.profile_name,
        last_synced_at = CASE WHEN eufy_sync.account_id = EXCLUDED.account_id AND eufy_sync.profile_id = EXCLUDED.profile_id
          THEN eufy_sync.last_synced_at ELSE NULL END,
        next_sync_at = now(), last_error = NULL, lease_id = NULL, lease_until = NULL
    `
    await tx`DELETE FROM eufy_setup WHERE user_id = ${userId}`
    return true
  })
}

export async function connectionStatus(userId: string) {
  const [connection] = await sql<
    {
      status: string
      expires_at: Date
      profile_name: string
      last_synced_at: Date | null
      last_error: string | null
      lease_until: Date | null
    }[]
  >`
    SELECT c.status, c.expires_at, s.profile_name, s.last_synced_at, s.last_error, s.lease_until
    FROM integration_connection c JOIN eufy_sync s ON s.connection_id = c.id
    WHERE c.user_id = ${userId} AND c.provider = 'eufy'
  `
  if (!connection) {
    return { status: 'disconnected' as const }
  }
  return {
    status:
      connection.status === 'reconnect_required' || connection.expires_at <= new Date()
        ? ('reconnect_required' as const)
        : ('connected' as const),
    profileName: connection.profile_name,
    expiresAt: connection.expires_at,
    lastSyncedAt: connection.last_synced_at,
    lastError: connection.last_error,
    syncing: Boolean(connection.lease_until && connection.lease_until > new Date())
  }
}

export async function disconnect(userId: string) {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM eufy_setup WHERE user_id = ${userId}`
    await tx`DELETE FROM integration_connection WHERE user_id = ${userId} AND provider = 'eufy'`
  })
}

export async function queueSync(userId: string) {
  const rows = await sql`
    UPDATE eufy_sync s SET next_sync_at = now() FROM integration_connection c
    WHERE c.id = s.connection_id AND c.user_id = ${userId} AND c.provider = 'eufy'
      AND c.status = 'active' AND c.expires_at > now() RETURNING s.connection_id
  `
  return rows.length > 0
}

export async function claimSync(userId?: string) {
  const leaseId = randomUUID()
  const [connection] = await sql<SyncConnection[]>`
    WITH due AS (
      SELECT s.connection_id FROM eufy_sync s
      JOIN integration_connection c ON c.id = s.connection_id
      JOIN users u ON u.id = c.user_id
      WHERE c.status = 'active' AND c.provider = 'eufy' AND u.disabled_at IS NULL
        AND (${userId ?? null}::uuid IS NULL OR c.user_id = ${userId ?? null}::uuid)
        AND s.next_sync_at <= now() AND (s.lease_until IS NULL OR s.lease_until < now())
      ORDER BY s.next_sync_at LIMIT 1 FOR UPDATE OF s SKIP LOCKED
    ), claimed AS (
      UPDATE eufy_sync s SET lease_id = ${leaseId}, lease_until = now() + interval '2 minutes'
      FROM due WHERE s.connection_id = due.connection_id RETURNING s.*
    )
    SELECT c.id, c.user_id, c.access_token, c.expires_at, s.account_id,
      s.profile_id, s.lease_id
    FROM claimed s JOIN integration_connection c ON c.id = s.connection_id
  `
  return connection
}

export async function finishSync(
  connection: SyncConnection,
  readings: EufyReading[],
  error?: string,
  reconnect = false
) {
  await sql.begin(async (tx) => {
    // Recheck after network I/O so disconnect/reconnect cannot resurrect data
    // or let an old token's failure overwrite the new connection.
    const [current] = await tx`
      SELECT c.id FROM integration_connection c JOIN eufy_sync s ON s.connection_id = c.id
      WHERE c.id = ${connection.id} AND s.lease_id = ${connection.lease_id}
        AND c.access_token = ${connection.access_token} FOR UPDATE OF c, s
    `
    if (!current) {
      return
    }
    for (const reading of readings) {
      await tx`
        INSERT INTO measurement (user_id, source, external_id, measured_at, weight_kg)
        VALUES (${connection.user_id}, 'eufy', ${reading.externalId}, ${reading.measuredAt}, ${reading.weightKg})
        ON CONFLICT (source, external_id) DO UPDATE SET measured_at = EXCLUDED.measured_at, weight_kg = EXCLUDED.weight_kg
        WHERE measurement.user_id = EXCLUDED.user_id
      `
    }
    await tx`
      UPDATE eufy_sync SET last_synced_at = CASE WHEN ${!error} THEN now() ELSE last_synced_at END,
        last_error = ${error ?? null}, next_sync_at = now() + interval '15 minutes', lease_id = NULL, lease_until = NULL
      WHERE connection_id = ${connection.id}
    `
    if (reconnect) {
      await tx`UPDATE integration_connection SET status = 'reconnect_required' WHERE id = ${connection.id}`
    }
  })
}

export async function removeExpiredSetups() {
  await sql`DELETE FROM eufy_setup WHERE expires_at <= now()`
}

export async function cancelSetup(userId: string) {
  await sql`DELETE FROM eufy_setup WHERE user_id = ${userId}`
}
