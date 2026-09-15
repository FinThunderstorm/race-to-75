import { expect, test } from './app-fixtures'

// Deliberate transport failures exercise retry UI; successful requests use the real API/database.
test('profile connection controls recover from status and disconnect failures', async ({
  page,
  application,
  signIn
}) => {
  const user = await signIn()
  const { sql } = application
  await sql`INSERT INTO integration_connection (user_id, provider, access_token, status)
    VALUES (${user.id}, 'withings', 'retry-access', 'active')`
  let statusFailed = true
  let disconnectFailed = true
  await page.route('**/api/integrations/withings/status', (route) =>
    statusFailed ? route.fulfill({ status: 500, json: { error: 'Unavailable' } }) : route.continue()
  )
  await page.route('**/api/integrations/withings', (route) =>
    disconnectFailed
      ? route.fulfill({ status: 500, json: { error: 'Unavailable' } })
      : route.continue()
  )
  await page.goto('/profile')
  const withings = page.getByRole('region', { name: 'Withings', exact: true })
  await expect(withings.getByRole('alert')).toContainText(
    'Withings-yhteyden tarkistaminen epäonnistui'
  )
  statusFailed = false
  await withings.getByRole('button', { name: 'Yritä uudelleen', exact: true }).click()
  await expect(withings.getByRole('status')).toHaveText('Yhdistetty')
  await withings.getByRole('button', { name: 'Katkaise Withings-yhteys' }).click()
  await expect(withings.getByRole('alert')).toHaveText(
    'Withings-yhteyden katkaiseminen epäonnistui. Yritä uudelleen.'
  )
  expect(await sql`SELECT id FROM integration_connection WHERE user_id = ${user.id}`).toHaveLength(
    1
  )
  disconnectFailed = false
  await withings.getByRole('button', { name: 'Katkaise Withings-yhteys' }).click()
  await expect(withings.getByRole('status')).toHaveText('Ei yhdistetty')
  expect(await sql`SELECT id FROM integration_connection WHERE user_id = ${user.id}`).toHaveLength(
    0
  )
})
