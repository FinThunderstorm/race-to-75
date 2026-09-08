import { expect, test } from '@playwright/test'

const user = {
  id: 'racer',
  email: 'racer@example.com',
  display_name: 'Office Racer',
  role: 'member'
}
const race = {
  participants: [
    {
      id: 'racer',
      name: 'Office Racer',
      measurements: [{ measuredAt: new Date().toISOString(), weightKg: 82 }]
    }
  ]
}

test('bottom-right IP indicator reports network access independently of login and updates after failures', async ({
  page
}) => {
  await page.clock.install()
  let allowed = true
  let fail = false
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }))
  await page.route('**/api/radiator/access', (route) =>
    route.fulfill(fail ? { status: 503, json: { error: 'Unavailable' } } : { json: { allowed } })
  )
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  const indicator = page.getByRole('complementary', { name: 'Network access' })
  await expect(indicator).toHaveText('IP allowed')
  await expect(page.getByRole('link', { name: 'Office Racer' })).toBeVisible()
  const bounds = (await indicator.boundingBox())!
  expect(bounds.x + bounds.width).toBeGreaterThan(1400)
  expect(bounds.y + bounds.height).toBeGreaterThan(960)
  allowed = false
  await page.clock.fastForward(30_100)
  await expect(indicator).toHaveText('IP not allowed')
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
  fail = true
  await page.clock.fastForward(30_100)
  await expect(indicator).toHaveText('IP check unavailable')
  fail = false
  allowed = true
  await page.clock.fastForward(30_100)
  await expect(indicator).toHaveText('IP allowed')
})

test('IP indicator is also visible on login without making the visitor authenticated', async ({
  page
}) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
  )
  await page.route('**/api/radiator/access', (route) => route.fulfill({ json: { allowed: true } }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await expect(page.getByRole('complementary', { name: 'Network access' })).toHaveText('IP allowed')
  await expect(page.getByRole('button', { name: 'Log in with passkey' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('IP visitor gets live data without account links and the chart fills and resizes with the window', async ({
  page
}) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
  )
  await page.route('**/api/radiator', (route) => route.fulfill({ json: race }))
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Office Racer/ })).toBeVisible()
  await expect(page.locator('.dashboard-footer')).toHaveText('Full screen')
  await expect(page.getByRole('link', { name: 'Office Racer' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Sample data|Live data/ })).toHaveCount(0)
  const chart = page.locator('.race-chart')
  await expect.poll(async () => (await chart.boundingBox())!.height).toBeGreaterThan(730)
  const before = (await chart.boundingBox())!
  expect(before.y + before.height).toBeGreaterThan(1040)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(1080)
  await page.setViewportSize({ width: 1920, height: 1440 })
  await expect
    .poll(async () => (await chart.boundingBox())!.height)
    .toBeCloseTo(before.height + 360, 0)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: /Office Racer/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('login and settings remain protected by a real session on an allowed network', async ({
  page
}) => {
  let signedIn = false
  await page.route('**/api/auth/me', (route) =>
    route.fulfill(signedIn ? { json: user } : { status: 401, json: { error: 'Unauthorized' } })
  )
  await page.route('**/api/radiator', (route) => route.fulfill({ json: race }))
  await page.goto('/')
  await expect(page.locator('.dashboard--radiator')).toBeVisible()
  await page.goto('/settings')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: 'Log in with passkey' })).toBeVisible()
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Log in with passkey' })).toBeVisible()
  signedIn = true
  await page.reload()
  await expect(page.getByRole('link', { name: 'Office Racer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
  await expect(page.locator('.dashboard--radiator')).toHaveCount(0)
})

test('IP radiator can enter fullscreen without showing profile or logout controls', async ({
  page
}) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
  )
  await page.route('**/api/radiator', (route) => route.fulfill({ json: race }))
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  const fullscreen = page.getByRole('button', { name: 'Full screen', exact: true })
  await expect(fullscreen).toBeVisible()
  await expect(page.locator('.dashboard-footer')).toHaveText('Full screen')
  await expect(page.getByRole('link', { name: 'Office Racer' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0)
  await fullscreen.click()
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement))
    .toBe(true)
  await expect(fullscreen).toBeHidden()
  await page.evaluate(() => document.exitFullscreen())
  await expect(fullscreen).toBeVisible()
})

test('anonymous radiator keeps its fullscreen footer visible when the browser blocks fullscreen', async ({
  page
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false })
  })
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
  )
  await page.route('**/api/radiator', (route) => route.fulfill({ json: race }))
  await page.goto('/')
  const footer = page.locator('.dashboard-footer')
  await expect(footer).toHaveText('Full screen')
  await footer.getByRole('button', { name: 'Full screen', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Full screen is unavailable in this browser or embedded view. Use your browser’s full-screen option.'
  )
  await expect(page.getByRole('link', { name: 'Office Racer' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0)
})

test('radiator standings stay aligned to the graph when other participants have no readings', async ({
  page
}) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
  )
  await page.route('**/api/radiator', (route) =>
    route.fulfill({
      json: {
        participants: [
          ...race.participants,
          { id: 'waiting', name: 'Waiting Racer', measurements: [] }
        ]
      }
    })
  )
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await expect(page.locator('.race-chart')).toBeVisible()
  const chart = (await page.locator('.race-chart').boundingBox())!
  const standings = (await page.locator('.race-standings').boundingBox())!
  expect(standings.height).toBeCloseTo(chart.height, 0)
  expect(standings.y).toBeCloseTo(chart.y, 0)
  await expect(page.getByRole('button', { name: /Waiting Racer/ })).toBeVisible()
})

test('denied IP redirects to login even when an override query parameter is supplied', async ({
  page
}) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
  )
  await page.route('**/api/radiator', (route) =>
    route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
  )
  await page.goto('/?ip-override=true')
  await expect(page).toHaveURL(/\/login$/)
})

test('short desktop windows keep every participant below the header and reachable by scrolling', async ({
  page
}) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
  )
  await page.route('**/api/radiator', (route) =>
    route.fulfill({
      json: {
        participants: Array.from({ length: 10 }, (_, index) => ({
          id: `racer-${index}`,
          name: `Racer ${index}`,
          measurements: [{ measuredAt: new Date().toISOString(), weightKg: 82 + index }]
        }))
      }
    })
  )
  await page.setViewportSize({ width: 1366, height: 400 })
  await page.goto('/')
  await expect(page.locator('.race-standings .participant')).toHaveCount(10)
  const chart = (await page.locator('.race-chart').boundingBox())!
  for (const person of await page.locator('.race-standings .participant').all()) {
    const bounds = (await person.boundingBox())!
    expect(bounds.y).toBeGreaterThanOrEqual(chart.y)
  }
})

test('radiator polls live data and removes the graph when IP access is revoked', async ({
  page
}) => {
  await page.clock.install()
  let allowed = true
  let requests = 0
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'Unauthorized' } })
  )
  await page.route('**/api/radiator', (route) => {
    requests += 1
    return route.fulfill(
      allowed ? { json: race } : { status: 401, json: { error: 'Unauthorized' } }
    )
  })
  await page.goto('/')
  await expect(page.locator('.race-chart')).toBeVisible()
  const initialRequests = requests
  await page.clock.fastForward(30_100)
  await expect.poll(() => requests).toBeGreaterThan(initialRequests)
  allowed = false
  await page.clock.fastForward(30_100)
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('.race-chart')).toHaveCount(0)
})
