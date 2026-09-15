import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'

import { expect, test } from './app-fixtures'
import { addVirtualAuthenticator, createCredential, getAssertion } from './webauthn'

// Produce independently signed negative cases, without calling the token helper
// under test. Keep the real challenge so the authenticator response remains valid.
function changeChallenge(value: string, secret: string, changes: Record<string, unknown>) {
  const payload = JSON.parse(Buffer.from(value.split('.')[0], 'base64url').toString())
  const body = Buffer.from(JSON.stringify({ ...payload, ...changes })).toString('base64url')
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
}

function tamperSignature(value: string) {
  const [body, signature] = value.split('.')
  return `${body}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
}

test('anonymous sessions and malformed or unknown enrollment links are rejected', async ({
  request
}) => {
  expect((await request.get('/api/auth/me')).status()).toBe(401)
  for (const data of [{ data: {} }, { token: 'unknown-enrollment-token' }]) {
    expect((await request.post('/api/auth/enroll/options', { data })).status()).toBe(400)
  }
})

test('valid passkeys cannot bypass invalid challenges, expired links or consumed invitations', async ({
  page,
  context,
  application
}) => {
  const { sql, url, config } = application
  const [user] = await sql`
    INSERT INTO users (email, display_name, role)
    VALUES (${`auth-security-${randomUUID()}@example.com`}, 'Security Tester', 'member')
    RETURNING id
  `
  try {
    const token = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    await sql`
    INSERT INTO enrollment_token (user_id, token_hash, expires_at)
    VALUES (${user.id}, ${tokenHash}, now() + interval '1 hour')
  `
    await page.goto('/')
    await addVirtualAuthenticator(page)
    const optionsResponse = await page.request.post('/api/auth/enroll/options', { data: { token } })
    expect(optionsResponse.status()).toBe(200)
    const credential = await createCredential(page, await optionsResponse.json())
    const enrollmentCookie = (await context.cookies()).find(
      ({ name }) => name === 'r2_enroll_challenge'
    )!
    const setChallenge = (name: string, value: string) =>
      context.addCookies([{ name, value, url, httpOnly: true }])
    const verifyEnrollment = () =>
      page.request.post('/api/auth/enroll/verify', {
        data: { token, response: credential }
      })

    for (const [label, cookie] of [
      ['missing', ''],
      ['tampered signature', tamperSignature(enrollmentCookie.value)],
      ['expired', changeChallenge(enrollmentCookie.value, config.cookieSecret, { exp: 1 })],
      [
        'another user',
        changeChallenge(enrollmentCookie.value, config.cookieSecret, { userId: randomUUID() })
      ]
    ]) {
      await test.step(`enrollment rejects ${label} challenge`, async () => {
        await setChallenge(enrollmentCookie.name, cookie)
        expect((await verifyEnrollment()).status()).toBe(400)
        expect((await page.request.get('/api/auth/me')).status()).toBe(401)
      })
    }

    await setChallenge(enrollmentCookie.name, enrollmentCookie.value)
    await sql`UPDATE enrollment_token SET expires_at = now() - interval '1 second' WHERE token_hash = ${tokenHash}`
    expect(
      (await page.request.post('/api/auth/enroll/options', { data: { token } })).status()
    ).toBe(400)
    expect((await verifyEnrollment()).status()).toBe(400)
    await sql`UPDATE enrollment_token SET expires_at = now() + interval '1 hour' WHERE token_hash = ${tokenHash}`
    // The exact same credential succeeds with the original, valid challenge/link.
    expect((await verifyEnrollment()).status()).toBe(200)
    expect((await page.request.get('/api/auth/me')).status()).toBe(200)
    await page.request.post('/api/auth/logout')
    await setChallenge(enrollmentCookie.name, enrollmentCookie.value)
    expect(
      (await page.request.post('/api/auth/enroll/options', { data: { token } })).status()
    ).toBe(400)
    expect((await verifyEnrollment()).status()).toBe(400)

    const loginOptionsResponse = await page.request.post('/api/auth/login/options')
    expect(loginOptionsResponse.status()).toBe(200)
    const assertion = await getAssertion(page, await loginOptionsResponse.json())
    const loginCookie = (await context.cookies()).find(({ name }) => name === 'r2_login_challenge')!
    const verifyLogin = () =>
      page.request.post('/api/auth/login/verify', { data: { response: assertion } })
    for (const [label, cookie] of [
      ['missing', ''],
      ['tampered signature', tamperSignature(loginCookie.value)],
      ['expired', changeChallenge(loginCookie.value, config.cookieSecret, { exp: 1 })],
      ['wrong purpose', changeChallenge(loginCookie.value, config.cookieSecret, { type: 'enroll' })]
    ]) {
      await test.step(`login rejects ${label} challenge`, async () => {
        await setChallenge(loginCookie.name, cookie)
        expect((await verifyLogin()).status()).toBe(400)
        expect((await page.request.get('/api/auth/me')).status()).toBe(401)
      })
    }
    await setChallenge(loginCookie.name, loginCookie.value)
    expect((await verifyLogin()).status()).toBe(200)
    const me = await page.request.get('/api/auth/me')
    expect(me.status()).toBe(200)
    expect(await me.json()).toMatchObject({ id: user.id, display_name: 'Security Tester' })
  } finally {
    await sql`DELETE FROM users WHERE id = ${user.id}`
  }
})
