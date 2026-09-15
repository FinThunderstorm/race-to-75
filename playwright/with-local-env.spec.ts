import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { test as base, expect } from '@playwright/test'

const test = base.extend<{ envLoader: (contents?: string) => string }>({
  envLoader: async ({}, use) => {
    const root = mkdtempSync(join(tmpdir(), 'race-local-env-'))
    try {
      const scripts = join(root, 'scripts')
      mkdirSync(scripts)
      const loader = join(scripts, 'with-local-env.mjs')
      copyFileSync(resolve(__dirname, '../scripts/with-local-env.mjs'), loader)
      await use((contents) => {
        if (contents !== undefined) {
          writeFileSync(join(root, '.env'), contents)
        }
        return loader
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('dotenv values override inherited settings and shell syntax remains literal', ({
  envLoader
}) => {
  const loader = envLoader('EXAMPLE="a b $HOME $(exit 7) `exit 9`"\nJWT_SECRET=\n')
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
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({
    value: 'a b $HOME $(exit 7) `exit 9`',
    secret: 'race-to-75-local-development'
  })
})

test('missing dotenv files preserve inherited settings', ({ envLoader }) => {
  const loader = envLoader()
  const result = spawnSync(
    process.execPath,
    [loader, process.execPath, '-e', 'console.log(process.env.EXAMPLE)'],
    {
      env: { ...process.env, EXAMPLE: 'inherited' },
      encoding: 'utf8'
    }
  )
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout.trim()).toBe('inherited')
})

test('subprocess failures propagate to the caller', ({ envLoader }) => {
  const loader = envLoader()
  const result = spawnSync(process.execPath, [loader, process.execPath, '-e', 'process.exit(7)'])
  expect(result.status).toBe(7)
})
