import { expect, test } from './app-fixtures'

test('allowed network exposes only radiator data and signed-in users return there after logout', async ({
  page,
  context,
  signIn
}) => {
  const user = await signIn()
  await context.clearCookies()
  const response = await page.request.get('/api/radiator')
  expect(response.status()).toBe(200)
  expect((await response.json()).participants).toContainEqual({
    id: user.id,
    name: user.displayName,
    heightCm: null,
    sex: null,
    sbdMeasurements: [],
    bicepsMeasurements: [],
    bloodPressureMeasurements: [],
    measurements: []
  })
  for (const path of [
    '/api/race',
    '/api/auth/me',
    '/api/admin/users',
    '/api/integrations/withings/status'
  ]) {
    expect((await page.request.get(path)).status()).toBe(401)
  }
  await page.goto('/')
  await expect(page.locator('.dashboard--radiator')).toBeVisible()
  await expect(page.locator('.dashboard-footer')).toHaveText('Koko näyttö')

  await signIn()
  await page.reload()
  await expect(page.getByRole('link', { name: 'Profiili' })).toBeVisible()
  await expect(page.locator('.dashboard--radiator')).toHaveCount(0)
  expect((await page.request.get('/api/race')).status()).toBe(200)
  await page.getByRole('button', { name: 'Kirjaudu ulos' }).click()
  await page.goto('/')
  await expect(page.locator('.dashboard--radiator')).toBeVisible()
  expect((await page.request.get('/api/race')).status()).toBe(401)
})
