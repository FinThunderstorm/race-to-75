import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const repo = fileURLToPath(new URL('../', import.meta.url))
const envFile = new URL('../.env', import.meta.url)
const localEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}
const [command, ...args] = process.argv.slice(2)

if (!command) {
  console.error('Usage: node scripts/with-local-env.mjs <command> [arguments...]')
  process.exit(1)
}

// Parse dotenv as data. Values may contain spaces, dollar signs, or shell syntax.
// The file wins over inherited values, including an already-running tmux server.
const env = { ...process.env, ...localEnv, RACE_TO_75_ENV_LOADED: repo }
env.JWT_SECRET ||= 'race-to-75-local-development'
env.COOKIE_SECRET ||= 'race-to-75-local-development'

const result = spawnSync(command, args, { env, stdio: 'inherit' })
if (result.error) {
  console.error(`Could not start ${command}: ${result.error.message}`)
}
process.exit(result.status ?? 1)
