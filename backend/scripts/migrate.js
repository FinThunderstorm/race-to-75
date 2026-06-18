import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import postgres from 'postgres'

const advisoryLockId = 75_075
const defaultDatabaseUrl = 'postgres://postgres:postgres@localhost:5432/race_to_75'
const retryableConnectionCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'])

function databaseUrl() {
  return process.env.DATABASE_URL ?? defaultDatabaseUrl
}

function migrationVersion(fileName) {
  return fileName.replace(/\.sql$/, '')
}

function checksum(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

async function loadMigrations() {
  const currentFile = fileURLToPath(import.meta.url)
  const migrationsDir = path.resolve(path.dirname(currentFile), '../migrations')
  const fileNames = (await readdir(migrationsDir))
    .filter((fileName) => /^\d+_[a-z0-9_]+\.sql$/.test(fileName))
    .sort()

  return Promise.all(
    fileNames.map(async (fileName) => {
      const sql = await readFile(path.join(migrationsDir, fileName), 'utf8')

      return {
        checksum: checksum(sql),
        name: fileName,
        sql,
        version: migrationVersion(fileName)
      }
    })
  )
}

async function ensureMigrationsTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `
}

async function validateAppliedMigrations(sql, migrations) {
  const applied = await sql`
    SELECT version, checksum
    FROM schema_migrations
    ORDER BY version ASC
  `
  const knownMigrations = new Map(migrations.map((migration) => [migration.version, migration]))

  for (const migration of applied) {
    const knownMigration = knownMigrations.get(migration.version)

    if (!knownMigration) {
      throw new Error(`Database has unknown migration ${migration.version}; refusing to continue`)
    }

    if (knownMigration.checksum !== migration.checksum) {
      throw new Error(`Migration ${migration.version} checksum changed after it was applied`)
    }
  }

  return new Set(applied.map((migration) => migration.version))
}

async function applyMigration(sql, migration) {
  await sql.begin(async (transaction) => {
    await transaction.unsafe(migration.sql)
    await transaction`
      INSERT INTO schema_migrations (version, name, checksum)
      VALUES (${migration.version}, ${migration.name}, ${migration.checksum})
    `
  })
}

async function migrate() {
  const migrations = await loadMigrations()
  const sql = postgres(databaseUrl(), {
    max: 1,
    onnotice: () => undefined
  })

  try {
    await ensureMigrationsTable(sql)
    await sql`SELECT pg_advisory_lock(${advisoryLockId})`

    try {
      const appliedVersions = await validateAppliedMigrations(sql, migrations)
      const pendingMigrations = migrations.filter(
        (migration) => !appliedVersions.has(migration.version)
      )

      for (const migration of pendingMigrations) {
        console.log(`Applying migration ${migration.name}`)
        await applyMigration(sql, migration)
      }

      console.log(
        pendingMigrations.length === 0
          ? 'Database schema is up to date'
          : `Applied ${pendingMigrations.length} migration(s)`
      )
    } finally {
      await sql`SELECT pg_advisory_unlock(${advisoryLockId})`
    }
  } finally {
    await sql.end()
  }
}

function isRetryableConnectionError(error) {
  if (retryableConnectionCodes.has(error?.code)) {
    return true
  }

  return (
    error?.errors?.some((nestedError) => retryableConnectionCodes.has(nestedError?.code)) ?? false
  )
}

async function migrateWithRetry() {
  const maxAttempts = Number.parseInt(process.env.DB_MIGRATION_ATTEMPTS ?? '30', 10)

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await migrate()
      return
    } catch (error) {
      if (attempt === maxAttempts || !isRetryableConnectionError(error)) {
        throw error
      }

      console.log(`Database is not ready yet; retrying migration (${attempt}/${maxAttempts})`)
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
}

migrateWithRetry().catch((error) => {
  console.error(error)
  process.exit(1)
})
