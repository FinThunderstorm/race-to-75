import postgres from 'postgres'

import { config } from './config.js'

export const sql = postgres(config.databaseUrl, {
  onnotice: () => undefined
})

export async function closeDatabase() {
  await sql.end()
}
