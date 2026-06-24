import { createHash, randomBytes } from 'node:crypto'

import postgres from 'postgres'

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/race_to_75'

export async function seedEnrollment(args: { email: string; displayName: string; role?: string }) {
  const sql = postgres(databaseUrl, { onnotice: () => undefined })

  try {
    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (email, display_name, role)
      VALUES (${args.email}, ${args.displayName}, ${args.role ?? 'member'})
      RETURNING id
    `
    const rawToken = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')

    await sql`
      INSERT INTO enrollment_token (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${tokenHash}, now() + interval '1 hour')
    `

    return { userId: user.id, rawToken }
  } finally {
    await sql.end()
  }
}
