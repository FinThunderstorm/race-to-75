import type postgres from 'postgres'

import { generateEnrollmentToken } from '../auth/tokens.js'
import { config } from '../config.js'
import { sql } from '../database.js'

type ManagedUser = {
  id: string
  email: string
  display_name: string
  role: 'admin' | 'member'
  disabled_at: Date | null
  enrolled: boolean
}

export class AdminError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
  }
}

export const listUsers = async (db: postgres.Sql | postgres.TransactionSql = sql, id?: string) =>
  db<ManagedUser[]>`
    SELECT u.id, u.email, u.display_name, u.role, u.disabled_at,
      EXISTS (SELECT 1 FROM credentials c WHERE c.user_id = u.id) AS enrolled
    FROM users u
    ${id ? db`WHERE u.id = ${id}` : db``}
    ORDER BY u.created_at, u.id
  `

type UserChanges = {
  email?: string
  display_name?: string
  role?: 'admin' | 'member'
  disabled?: boolean
}

type UserAction =
  | { type: 'create'; email: string; display_name: string }
  | { type: 'update'; id: string; changes: UserChanges }
  | { type: 'enrollment'; id: string }

async function issueEnrollment(tx: postgres.TransactionSql, userId: string) {
  const { rawToken, tokenHash } = generateEnrollmentToken()
  await tx`
    UPDATE enrollment_token SET consumed_at = now()
    WHERE user_id = ${userId} AND consumed_at IS NULL
  `
  const [token] = await tx<{ expires_at: Date }[]>`
    INSERT INTO enrollment_token (user_id, token_hash, expires_at)
    VALUES (${userId}, ${tokenHash}, now() + ${config.enrollmentTokenTtlSeconds} * interval '1 second')
    RETURNING expires_at
  `
  const url = new URL('/enroll', config.webauthnOrigin)
  url.searchParams.set('token', rawToken)
  return { enrollmentUrl: url.toString(), expiresAt: token.expires_at }
}

export async function manageUser(actorId: string, action: UserAction) {
  return sql.begin(async (tx) => {
    // Management is infrequent. Serialize writes, including other user provisioners,
    // so authorization, case-insensitive duplicates, and admin counts are atomic.
    await tx`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`
    const [actor] = await tx<ManagedUser[]>`SELECT * FROM users WHERE id = ${actorId}`
    if (!actor || actor.disabled_at) {
      throw new AdminError(401, 'Unauthorized')
    }
    if (actor.role !== 'admin') {
      throw new AdminError(403, 'Admin access required')
    }

    const [target] =
      action.type === 'create'
        ? []
        : await tx<ManagedUser[]>`
      SELECT * FROM users WHERE id = ${action.id} FOR UPDATE
    `
    if (action.type !== 'create' && !target) {
      throw new AdminError(404, 'User not found')
    }

    const email =
      action.type === 'create'
        ? action.email
        : action.type === 'update'
          ? action.changes.email
          : undefined
    if (email !== undefined) {
      const [duplicate] = await tx`
        SELECT id FROM users WHERE lower(btrim(email)) = lower(${email})
        ${action.type === 'update' ? tx`AND id <> ${action.id}` : tx``}
      `
      if (duplicate) {
        throw new AdminError(409, 'An account with this email already exists')
      }
    }

    if (action.type === 'create') {
      const [created] = await tx<{ id: string }[]>`
        INSERT INTO users (email, display_name, role)
        VALUES (${action.email}, ${action.display_name}, 'member') RETURNING id
      `
      const invitation = await issueEnrollment(tx, created.id)
      const [user] = await listUsers(tx, created.id)
      return { user, ...invitation }
    }

    if (!target) {
      throw new AdminError(404, 'User not found')
    }
    if (action.type === 'enrollment') {
      if (target.disabled_at) {
        throw new AdminError(409, 'Enable this account before issuing an enrollment link')
      }
      const invitation = await issueEnrollment(tx, target.id)
      const [user] = await listUsers(tx, target.id)
      return { user, ...invitation }
    }

    const { changes } = action
    if (target.id === actorId && (changes.disabled === true || changes.role === 'member')) {
      throw new AdminError(409, 'Another admin must disable or demote your account')
    }
    const role = changes.role ?? target.role
    const disabledAt =
      changes.disabled === undefined ? target.disabled_at : changes.disabled ? new Date() : null
    if (target.role === 'admin' && !target.disabled_at && (role !== 'admin' || disabledAt)) {
      const [otherAdmin] = await tx`
        SELECT id FROM users
        WHERE role = 'admin' AND disabled_at IS NULL AND id <> ${target.id} LIMIT 1
      `
      if (!otherAdmin) {
        throw new AdminError(409, 'At least one enabled admin must remain')
      }
    }
    await tx`
      UPDATE users SET email = ${changes.email ?? target.email},
        display_name = ${changes.display_name ?? target.display_name}, role = ${role},
        disabled_at = ${disabledAt}
      WHERE id = ${target.id}
    `
    if (changes.disabled === true) {
      await tx`
        UPDATE enrollment_token SET consumed_at = now()
        WHERE user_id = ${target.id} AND consumed_at IS NULL
      `
    }
    const [user] = await listUsers(tx, target.id)
    return { user }
  })
}
