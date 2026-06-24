import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildEnrollmentLink } from './bootstrap-admin.js'

test('buildEnrollmentLink builds an /enroll URL with the token', () => {
  assert.equal(
    buildEnrollmentLink('https://race-to-75.rigster.cv', 'abc123'),
    'https://race-to-75.rigster.cv/enroll?token=abc123'
  )
})

test('buildEnrollmentLink trims a trailing slash on the base URL', () => {
  assert.equal(
    buildEnrollmentLink('https://race-to-75.rigster.cv/', 'abc123'),
    'https://race-to-75.rigster.cv/enroll?token=abc123'
  )
})
