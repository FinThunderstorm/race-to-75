import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { test as appTest, expect } from './app-fixtures'
import { addVirtualAuthenticator } from './webauthn'

const execFileAsync = promisify(execFile)
// Bootstrap needs its own empty database, even when other journey specs share a worker.
const test = appTest.extend<{}, { bootstrapWorker: void }>({
  bootstrapWorker: [async ({}, use) => use(), { scope: 'worker', auto: true }]
})

test('bootstrap CLI creates an admin with a working single-use enrollment link and refuses a second admin', async ({
  application,
  page
}) => {
  const root = resolve(__dirname, '..')
  const args = [
    'backend/scripts/bootstrap-admin.js',
    '--email',
    'bootstrap@example.com',
    '--name',
    'Bootstrap Admin',
    '--base-url',
    `${application.url}/`
  ]
  const options = {
    cwd: root,
    env: { ...process.env, DATABASE_URL: application.databaseUrl, WEBAUTHN_ORIGIN: application.url }
  }
  const first = await execFileAsync(process.execPath, args, options)
  const enrollmentUrl = first.stdout.split('\n').find((line) => line.startsWith('http'))
  expect(enrollmentUrl).toBeDefined()
  const link = new URL(enrollmentUrl!)
  expect(link.origin).toBe(application.url)
  expect(link.pathname).toBe('/enroll')
  expect(link.searchParams.get('token')).toBeTruthy()

  await page.goto('/')
  await addVirtualAuthenticator(page)
  await page.goto(enrollmentUrl!)
  await page.getByRole('button', { name: 'Luo pääsyavain' }).click()
  await expect(page.getByText('Kirjautuneena Bootstrap Admin')).toBeVisible()
  await page.getByRole('link', { name: 'Ylläpito', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Käyttäjähallinta', exact: true })).toBeVisible()
  const me = await page.request.get('/api/auth/me')
  expect(me.status()).toBe(200)
  expect(await me.json()).toMatchObject({ email: 'bootstrap@example.com', role: 'admin' })
  expect(
    (
      await page.request.post('/api/auth/enroll/options', {
        data: { token: link.searchParams.get('token') }
      })
    ).status()
  ).toBe(400)

  const secondArgs = [...args]
  secondArgs[2] = 'second-admin@example.com'
  await expect(execFileAsync(process.execPath, secondArgs, options)).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining('An admin already exists; refusing to bootstrap another.')
  })
  const admins = await application.sql`SELECT email FROM users WHERE role = 'admin'`
  expect(admins.map(({ email }) => email)).toEqual(['bootstrap@example.com'])
})
