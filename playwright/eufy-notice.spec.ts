import { expect, test } from '@playwright/test'

test('expired Eufy token shows a prominent notice and reconnecting clears it', async ({ page }) => {
  await page.clock.install()
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 'notice-user',
        display_name: 'Racer',
        email: 'racer@example.com',
        role: 'member'
      }
    })
  )
  await page.route('**/api/integrations/withings/status', (route) =>
    route.fulfill({
      json: {
        connected: false,
        configured: false,
        automaticUpdates: false
      }
    })
  )
  let expired = false
  await page.route('**/api/integrations/eufy/status', (route) =>
    route.fulfill({
      json: {
        status: expired ? 'reconnect_required' : 'connected',
        profileName: 'My profile'
      }
    })
  )
  await page.route('**/api/integrations/eufy/login', (route) =>
    route.fulfill({
      json: {
        setupId: 'setup',
        profiles: [{ id: 'me', name: 'My profile' }]
      }
    })
  )
  await page.route('**/api/integrations/eufy/profile', (route) => {
    expired = false
    return route.fulfill({ json: { status: 'connected', profileName: 'My profile' } })
  })
  await page.goto('/')
  const notice = page.getByRole('alert', { name: 'Yhdistä Eufy Life uudelleen' })
  await expect(page.getByRole('link', { name: 'Racer', exact: true })).toBeVisible()
  await expect(notice).toHaveCount(0)
  expired = true
  await page.clock.runFor(30_100)
  await expect(notice).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(notice.getByRole('link', { name: 'Yhdistä uudelleen nyt' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await notice.getByRole('link', { name: 'Yhdistä uudelleen nyt' }).click()
  await expect(page.getByLabel('Eufy Life -sähköposti')).toBeVisible()
  await page.getByLabel('Eufy Life -sähköposti').fill('racer@example.com')
  await page.getByLabel('Eufy Life -salasana').fill('test-password')
  await page.getByRole('button', { name: 'Kirjaudu Eufy Lifeen' }).click()
  await page.getByLabel('Eufy Life -profiilisi').selectOption('me')
  await page.getByRole('button', { name: 'Käytä tätä profiilia' }).click()
  await expect(notice).toHaveCount(0)
})

test('anonymous visitors never fetch personal Eufy status or see the notice', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: {} }))
  let statusRequests = 0
  await page.route('**/api/integrations/eufy/status', (route) => {
    statusRequests++
    return route.fulfill({ json: { status: 'reconnect_required' } })
  })
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Kirjaudu sisään pääsyavaimella' })).toBeVisible()
  await expect(page.getByRole('alert', { name: 'Yhdistä Eufy Life uudelleen' })).toHaveCount(0)
  expect(statusRequests).toBe(0)
})
