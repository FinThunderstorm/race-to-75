import { createHash, randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'

import postgres from 'postgres'

const defaultDatabaseUrl = 'postgres://postgres:postgres@localhost:5432/race_to_75'
const enrollmentTokenTtlSeconds = Number(process.env.ENROLLMENT_TOKEN_TTL_SECONDS ?? 86_400)

export function buildEnrollmentLink(baseUrl, rawToken) {
  return `${baseUrl.replace(/\/$/, '')}/enroll?token=${rawToken}`
}

function resolveBaseUrl(explicit) {
  if (explicit) {
    return explicit
  }

  if (process.env.WEBAUTHN_ORIGIN) {
    return process.env.WEBAUTHN_ORIGIN
  }

  const host = process.env.APP_HOST ?? 'localhost:7500'

  return host.startsWith('http') ? host : `https://${host}`
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      'base-url': { type: 'string' }
    }
  })

  if (!values.email || !values.name) {
    console.error(
      'Usage: npm run auth:bootstrap-admin -- --email <e> --name <n> [--base-url <url>]'
    )
    process.exit(1)
  }

  const sql = postgres(process.env.DATABASE_URL ?? defaultDatabaseUrl, {
    onnotice: () => undefined
  })

  try {
    const [user] = await sql`
      INSERT INTO users (email, display_name, role)
      VALUES (${values.email}, ${values.name}, 'admin')
      ON CONFLICT (email)
      DO UPDATE SET display_name = EXCLUDED.display_name, role = 'admin'
      RETURNING id
    `

    const rawToken = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')

    await sql`
      INSERT INTO enrollment_token (user_id, token_hash, expires_at)
      VALUES (
        ${user.id},
        ${tokenHash},
        now() + (${enrollmentTokenTtlSeconds} * interval '1 second')
      )
    `

    console.log('Admin user ready. Enrollment link (single-use):')
    console.log(buildEnrollmentLink(resolveBaseUrl(values['base-url']), rawToken))
  } finally {
    await sql.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
