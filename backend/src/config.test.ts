import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const readConfig = (overrides: Record<string, string>) =>
  spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
    const { config } = await import(${JSON.stringify(new URL('./config.ts', import.meta.url).href)})
    console.log(JSON.stringify({ ip: config.radiatorAllowedIp ?? null, proxies: config.trustProxy }))
  `
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        JWT_SECRET: 'radiator-test-secret-value',
        COOKIE_SECRET: 'radiator-test-cookie-value',
        RADIATOR_ALLOWED_IP: '',
        TRUST_PROXY: '',
        ...overrides
      }
    }
  )

test('radiator and forwarded-header trust default off for empty deployment settings', () => {
  const result = readConfig({})
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { ip: null, proxies: [] })
})

test('accepts a single IP and trims a list of trusted proxy addresses and subnets', () => {
  const result = readConfig({
    RADIATOR_ALLOWED_IP: '2001:db8::75',
    TRUST_PROXY: ' 10.20.0.2, 10.30.0.0/24, 2001:db8::/64 '
  })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), {
    ip: '2001:db8::75',
    proxies: ['10.20.0.2', '10.30.0.0/24', '2001:db8::/64']
  })
})

test('rejects malformed allowed IPs and proxy values instead of silently broadening access', () => {
  for (const overrides of [
    { RADIATOR_ALLOWED_IP: 'office.example.com' },
    { RADIATOR_ALLOWED_IP: '192.0.2.0/24' },
    { TRUST_PROXY: 'true' },
    { TRUST_PROXY: '10.20.0.0/99' },
    { TRUST_PROXY: '10.20.0.2,' }
  ]) {
    assert.notEqual(readConfig(overrides).status, 0)
  }
})
