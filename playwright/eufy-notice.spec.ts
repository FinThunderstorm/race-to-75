import { expect, test } from './app-fixtures'

test('anonymous visitors never fetch personal Eufy status or see the notice', async ({ page }) => {
  const statusRequests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/integrations/eufy/status') {
      statusRequests.push(request.url())
    }
  })
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Kirjaudu sisään pääsyavaimella' })).toBeVisible()
  await expect(page.getByRole('alert', { name: 'Yhdistä Eufy Life uudelleen' })).toHaveCount(0)
  expect(statusRequests).toHaveLength(0)
})
