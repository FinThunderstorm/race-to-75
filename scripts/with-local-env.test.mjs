import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

function fixture(t, contents) {
  const root = mkdtempSync(join(tmpdir(), 'race-local-env-'))
  const scripts = join(root, 'scripts')
  mkdirSync(scripts)
  const loader = join(scripts, 'with-local-env.mjs')
  copyFileSync(new URL('./with-local-env.mjs', import.meta.url), loader)
  if (contents !== undefined) {
    writeFileSync(join(root, '.env'), contents)
  }
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return loader
}

test('dotenv values override inherited settings and shell syntax remains literal', (t) => {
  const loader = fixture(t, 'EXAMPLE="a b $HOME $(exit 7) `exit 9`"\nJWT_SECRET=\n')
  const result = spawnSync(
    process.execPath,
    [
      loader,
      process.execPath,
      '-e',
      'console.log(JSON.stringify({ value: process.env.EXAMPLE, secret: process.env.JWT_SECRET }))'
    ],
    {
      env: { ...process.env, EXAMPLE: 'stale tmux value', JWT_SECRET: 'inherited value' },
      encoding: 'utf8'
    }
  )
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), {
    value: 'a b $HOME $(exit 7) `exit 9`',
    secret: 'race-to-75-local-development'
  })
})

test('missing dotenv files preserve inherited settings', (t) => {
  const loader = fixture(t)
  const result = spawnSync(
    process.execPath,
    [loader, process.execPath, '-e', 'console.log(process.env.EXAMPLE)'],
    {
      env: { ...process.env, EXAMPLE: 'inherited' },
      encoding: 'utf8'
    }
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'inherited')
})

test('subprocess failures propagate to the caller', (t) => {
  const loader = fixture(t)
  const result = spawnSync(process.execPath, [loader, process.execPath, '-e', 'process.exit(7)'])
  assert.equal(result.status, 7)
})
