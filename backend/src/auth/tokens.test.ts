import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  generateEnrollmentToken,
  hashEnrollmentToken,
  isEnrollmentTokenUsable,
  signChallenge,
  verifyChallenge
} from './tokens.ts'

test('hashEnrollmentToken is stable hex and hides the raw token', () => {
  const hash = hashEnrollmentToken('raw-token')
  assert.equal(hash, hashEnrollmentToken('raw-token'))
  assert.match(hash, /^[0-9a-f]{64}$/)
  assert.notEqual(hash, 'raw-token')
})

test('generateEnrollmentToken returns a raw token whose hash matches', () => {
  const { rawToken, tokenHash } = generateEnrollmentToken()
  assert.ok(rawToken.length >= 32)
  assert.equal(tokenHash, hashEnrollmentToken(rawToken))
})

test('isEnrollmentTokenUsable: fresh unconsumed token is usable', () => {
  const now = new Date('2026-06-24T12:00:00Z')
  const expiresAt = new Date('2026-06-24T13:00:00Z')
  assert.equal(isEnrollmentTokenUsable({ consumedAt: null, expiresAt }, now), true)
})

test('isEnrollmentTokenUsable: consumed token is not usable', () => {
  const now = new Date('2026-06-24T12:00:00Z')
  const expiresAt = new Date('2026-06-24T13:00:00Z')
  const consumedAt = new Date('2026-06-24T11:00:00Z')
  assert.equal(isEnrollmentTokenUsable({ consumedAt, expiresAt }, now), false)
})

test('isEnrollmentTokenUsable: expired token is not usable', () => {
  const now = new Date('2026-06-24T14:00:00Z')
  const expiresAt = new Date('2026-06-24T13:00:00Z')
  assert.equal(isEnrollmentTokenUsable({ consumedAt: null, expiresAt }, now), false)
})

test('verifyChallenge round-trips a signed payload', () => {
  const now = new Date('2026-06-24T12:00:00Z')
  const exp = Math.floor(now.getTime() / 1000) + 300
  const value = signChallenge({ challenge: 'abc', type: 'enroll', userId: 'u1', exp }, 'secret')
  const parsed = verifyChallenge(value, 'secret', now)
  assert.equal(parsed.challenge, 'abc')
  assert.equal(parsed.type, 'enroll')
  assert.equal(parsed.userId, 'u1')
})

test('verifyChallenge rejects a tampered signature', () => {
  const now = new Date('2026-06-24T12:00:00Z')
  const exp = Math.floor(now.getTime() / 1000) + 300
  const value = signChallenge({ challenge: 'abc', type: 'login', exp }, 'secret')
  assert.throws(() => verifyChallenge(value, 'wrong-secret', now))
})

test('verifyChallenge rejects an expired payload', () => {
  const past = Math.floor(new Date('2026-06-24T11:00:00Z').getTime() / 1000)
  const value = signChallenge({ challenge: 'abc', type: 'login', exp: past }, 'secret')
  assert.throws(() => verifyChallenge(value, 'secret', new Date('2026-06-24T12:00:00Z')))
})
