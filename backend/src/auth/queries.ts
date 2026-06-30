import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'

import { sql } from '../database.js'

export const findUserByEnrollmentTokenHash = async (tokenHash: string) => {
  const [row] = await sql<
    {
      user_id: string
      email: string
      role: 'admin' | 'member'
      consumed_at: Date | null
      expires_at: Date
    }[]
  >`
    SELECT t.user_id, u.email, u.role, t.consumed_at, t.expires_at
    FROM enrollment_token t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ${tokenHash}
    LIMIT 1
  `

  if (!row) {
    return undefined
  }

  return {
    userId: row.user_id,
    email: row.email,
    role: row.role,
    consumedAt: row.consumed_at ?? undefined,
    expiresAt: row.expires_at
  }
}

export const findUserById = async (userId: string) => {
  const [row] = await sql<
    { id: string; email: string; display_name: string; role: 'admin' | 'member' }[]
  >`
    SELECT id, email, display_name, role
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `

  return row ?? undefined
}

export const findCredentialsByUser = async (userId: string) => {
  const rows = await sql<{ credential_id: string; transports: AuthenticatorTransportFuture[] }[]>`
    SELECT credential_id, transports
    FROM credentials
    WHERE user_id = ${userId}
  `

  return rows.map((row) => ({ credentialId: row.credential_id, transports: row.transports }))
}

export const findCredentialById = async (credentialId: string) => {
  const [row] = await sql<
    {
      user_id: string
      public_key: Uint8Array<ArrayBuffer>
      counter: string
      transports: AuthenticatorTransportFuture[]
      role: 'admin' | 'member'
    }[]
  >`
    SELECT c.user_id, c.public_key, c.counter, c.transports, u.role
    FROM credentials c
    JOIN users u ON u.id = c.user_id
    WHERE c.credential_id = ${credentialId}
    LIMIT 1
  `

  if (!row) {
    return undefined
  }

  return {
    userId: row.user_id,
    publicKey: row.public_key,
    counter: Number(row.counter),
    transports: row.transports,
    role: row.role
  }
}

export const updateCredentialCounter = async (credentialId: string, counter: number) => {
  await sql`UPDATE credentials SET counter = ${counter} WHERE credential_id = ${credentialId}`
}

export const consumeEnrollmentTokenAndInsertCredential = async (args: {
  tokenHash: string
  userId: string
  credentialId: string
  publicKey: Uint8Array
  counter: number
  transports: AuthenticatorTransportFuture[]
  deviceName: string | null
}) => {
  await sql.begin(async (tx) => {
    const consumed = await tx`
      UPDATE enrollment_token
      SET consumed_at = now()
      WHERE token_hash = ${args.tokenHash}
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING id
    `

    if (consumed.length === 0) {
      throw new Error('Enrollment token is no longer usable')
    }

    await tx`
      INSERT INTO credentials (user_id, credential_id, public_key, counter, transports, device_name)
      VALUES (
        ${args.userId},
        ${args.credentialId},
        ${Buffer.from(args.publicKey)},
        ${args.counter},
        ${args.transports},
        ${args.deviceName}
      )
    `
  })
}
