import { expect, test } from '@playwright/test'

// Keep the pause time safely beyond page loading and the test timeout.
const pausedTime = new Date('2026-09-10T13:00:00Z')

const user = { id: 'bmi-user', display_name: 'BMI Racer', email: 'bmi@example.com', role: 'member' }
const participants = [
  {
    id: user.id,
    name: user.display_name,
    heightCm: 180,
    measurements: [
      { measuredAt: '2026-09-07T08:00:00Z', weightKg: 84.24 },
      { measuredAt: '2026-09-09T08:00:00Z', weightKg: 81 }
    ]
  },
  {
    id: 'missing',
    name: 'Missing Height',
    heightCm: null,
    measurements: [{ measuredAt: '2026-09-09T08:00:00Z', weightKg: 80 }]
  },
  { id: 'waiting', name: 'Waiting Racer', heightCm: 170, measurements: [] }
]

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') })
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }))
  await page.route('**/api/race', (route) => route.fulfill({ json: { participants } }))
})

test('BMI updates the chart, table and badges, preserving colors and mode across data switches', async ({
  page
}) => {
  await page.goto('/')
  const racer = page.getByRole('button', { name: /BMI Racer/ })
  const color = await racer.evaluate((element) =>
    (element as HTMLElement).style.getPropertyValue('--racer-color')
  )
  await page.getByRole('button', { name: 'BMI', exact: true }).click()
  await expect(page).toHaveURL(/mode=bmi/)
  await expect(racer).toContainText('100,0')
  expect(
    await racer.evaluate((element) =>
      (element as HTMLElement).style.getPropertyValue('--racer-color')
    )
  ).toBe(color)
  await expect(page.locator('.reference-band-label')).toHaveText('BMI 18,5–25 (100 kp)')
  await expect(page.locator('.chart-series circle title')).toHaveText([
    'BMI Racer: 26,0 BMI (96,2 kp) · Päiväkeskiarvo · 7.9.2026',
    'BMI Racer: 25,0 BMI (100,0 kp) · Päiväkeskiarvo · 9.9.2026'
  ])
  await expect(page.locator('.personal-low, .setback, .winner')).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Osallistujat, joilta puuttuu pituus' })
  ).toContainText('Missing Height')
  await page.getByText('Näytä mittaukset', { exact: true }).click()
  await expect(
    page.getByRole('row', {
      name: 'BMI Racer 26,0 BMI (96,2 kp) 25,0 BMI (100,0 kp) −1,0 9.9.2026'
    })
  ).toBeVisible()
  await expect(page.getByRole('table')).not.toContainText('kilogrammoina')
  await page.reload()
  await expect(page.getByRole('button', { name: 'BMI', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await page.getByRole('link', { name: 'Ryhmän mittaukset', exact: true }).click()
  await expect(page).toHaveURL(/mode=bmi.*data=sample/)
  await expect(page.locator('.reference-band-label')).toHaveText('BMI 18,5–25 (100 kp)')
  await page.getByRole('link', { name: 'Esimerkkimittaukset', exact: true }).click()
  await expect(racer).toContainText('100,0')
  await page.getByRole('button', { name: 'Paino · 75 kg', exact: true }).click()
  await expect(racer).toContainText('81,0')
  await expect(page.locator('.goal-label')).toHaveText('75,0 KG — TAVOITE')
})

test('missing heights explain an empty chart even when another participant has no readings', async ({
  page
}) => {
  await page.route('**/api/race', (route) =>
    route.fulfill({
      json: {
        participants: participants.map((person) => ({
          ...person,
          heightCm: person.id === 'waiting' ? 170 : null
        }))
      }
    })
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?mode=bmi')
  await expect(page.getByRole('status')).toHaveText(
    'Lisää pituus asetuksissa, jotta tulokset voidaan näyttää.'
  )
  await expect(
    page.getByRole('region', { name: 'Osallistujat, joilta puuttuu pituus' })
  ).toContainText('BMI Racer')
  await expect(page.getByRole('link', { name: 'Lisää pituutesi' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Paino · 75 kg', exact: true }).click()
  await expect(page.getByRole('button', { name: /BMI Racer 81,0/ })).toBeVisible()
})

test('BMI radiator stays read-only and renders without account controls', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/radiator', (route) => route.fulfill({ json: { participants } }))
  await page.goto('/?mode=bmi&data=sample')
  await expect(page.locator('.reference-band-label')).toHaveText('BMI 18,5–25 (100 kp)')
  await expect(page.getByRole('button', { name: /BMI Racer 25,0.*100,0 kp/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Lisää pituutesi|Esimerkkimittaukset/ })).toHaveCount(
    0
  )
  await expect(page.getByRole('button', { name: 'Kirjaudu ulos' })).toHaveCount(0)
})

test('height can be saved, corrected and cleared, with retryable loading and saving', async ({
  page
}) => {
  let heightCm: number | null = null
  let failLoad = true
  let failSave = true
  await page.route('**/api/profile', (route) => {
    if (route.request().method() === 'PUT') {
      if (failSave) {
        return route.fulfill({ status: 500, json: {} })
      }
      heightCm = route.request().postDataJSON().heightCm
    } else if (failLoad) {
      return route.fulfill({ status: 500, json: {} })
    }
    return route.fulfill({ json: { heightCm } })
  })
  await page.route('**/api/race', (route) =>
    route.fulfill({ json: { participants: [{ ...participants[0], heightCm }] } })
  )
  await page.route('**/api/integrations/withings/status', (route) =>
    route.fulfill({ json: { connected: false, configured: false } })
  )
  await page.route('**/api/integrations/eufy/status', (route) =>
    route.fulfill({ json: { status: 'disconnected' } })
  )
  await page.goto('/?mode=bmi')
  await page.getByRole('link', { name: 'Lisää pituutesi' }).click()
  const panel = page.getByRole('region', { name: 'Kisaprofiili' })
  await expect(panel.getByRole('alert')).toContainText('Pituuden lataaminen epäonnistui')
  failLoad = false
  await panel.getByRole('button', { name: 'Yritä ladata pituus uudelleen' }).click()
  await panel.getByRole('spinbutton', { name: 'Pituus (cm)' }).fill('180')
  await panel.getByRole('button', { name: 'Tallenna pituus' }).click()
  await expect(panel.getByRole('alert')).toContainText('Pituuden tallentaminen epäonnistui')
  failSave = false
  await panel.getByRole('button', { name: 'Tallenna pituus' }).click()
  await expect(panel.getByRole('status')).toHaveText('Pituus tallennettu.')
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page).toHaveURL(/mode=bmi/)
  await expect(page.getByRole('button', { name: /BMI Racer 25,0.*100,0 kp/ })).toBeVisible()
  await page.getByRole('link', { name: 'BMI Racer', exact: true }).click()
  await panel.getByRole('spinbutton', { name: 'Pituus (cm)' }).fill('190')
  await panel.getByRole('button', { name: 'Tallenna pituus' }).click()
  await expect(panel.getByRole('status')).toHaveText('Pituus tallennettu.')
  await page.reload()
  await expect(panel.getByRole('spinbutton', { name: 'Pituus (cm)' })).toHaveValue('190')
  await panel.getByRole('spinbutton', { name: 'Pituus (cm)' }).fill('')
  await panel.getByRole('button', { name: 'Tallenna pituus' }).click()
  await expect(panel.getByRole('status')).toHaveText('Pituus poistettu.')
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page).toHaveURL(/\/\?mode=bmi$/)
  await expect(page.locator('.dashboard').getByRole('status')).toHaveText(
    'Lisää pituus asetuksissa, jotta tulokset voidaan näyttää.'
  )
})

test('BMI sample charts remain readable at desktop and mobile sizes', async ({ page }) => {
  await page.goto('/?mode=bmi&data=sample')
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport)
    await expect(page.locator('.chart-series')).toHaveCount(5)
    await expect(
      page.getByRole('region', { name: 'Osallistujat, joilta puuttuu pituus' })
    ).toContainText('Sanna')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/bmi-${viewport.width}.png`, fullPage: true })
  }
})

test('mode buttons automatically cycle every ten seconds and support pause and resume', async ({
  page
}) => {
  await page.goto('/?data=sample')
  const classic = page.getByRole('button', { name: 'Paino · 75 kg', exact: true })
  const bmi = page.getByRole('button', { name: 'BMI', exact: true })
  await expect(classic).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
  await page.clock.pauseAt(pausedTime)
  await page.getByRole('button', { name: 'Käynnistä näkymien automaattinen vaihto' }).click()
  const historyLength = await page.evaluate(() => history.length)
  await page.clock.runFor(9999)
  await expect(classic).toHaveAttribute('aria-pressed', 'true')
  await page.clock.runFor(1)
  await expect(bmi).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/data=sample&mode=bmi/)
  await page.clock.runFor(10000)
  await expect(page.getByRole('button', { name: 'Hauis', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await page.clock.runFor(10000)
  await expect(page.getByRole('button', { name: 'Verenpaine', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await page.clock.runFor(10000)
  await expect(page.getByRole('button', { name: 'Ihmisarvo', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await page.clock.runFor(10000)
  await expect(classic).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => history.length)).toBe(historyLength)

  await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
  await bmi.click()
  await page.clock.runFor(30000)
  await expect(bmi).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Käynnistä näkymien automaattinen vaihto' }).click()
  await page.clock.runFor(9999)
  await expect(bmi).toHaveAttribute('aria-pressed', 'true')
  await page.clock.runFor(1)
  await expect(page.getByRole('button', { name: 'Hauis', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})

test('manual mode selection restarts the automatic countdown on the radiator', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/radiator', (route) => route.fulfill({ json: { participants } }))
  await page.goto('/?mode=bmi')
  const classic = page.getByRole('button', { name: 'Paino · 75 kg', exact: true })
  const bmi = page.getByRole('button', { name: 'BMI', exact: true })
  await expect(bmi).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
  await page.clock.pauseAt(pausedTime)
  await page.getByRole('button', { name: 'Käynnistä näkymien automaattinen vaihto' }).click()
  await page.clock.runFor(5000)
  await classic.click()
  await expect(classic).toHaveAttribute('aria-pressed', 'true')
  await page.clock.runFor(9999)
  await expect(classic).toHaveAttribute('aria-pressed', 'true')
  await page.clock.runFor(1)
  await expect(bmi).toHaveAttribute('aria-pressed', 'true')
})

test('mode switches keep the header, controls and plot in place on desktop and mobile', async ({
  page
}) => {
  for (const radiator of [false, true]) {
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: radiator ? 401 : 200, json: radiator ? {} : user })
    )
    await page.route('**/api/radiator', (route) => route.fulfill({ json: { participants } }))
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto('/?data=sample')
      await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
      const selectors = ['.race-header', '.race-mode', '.sample-indicator', '.race-chart']
      const before = await Promise.all(
        selectors.map((selector) => page.locator(selector).boundingBox())
      )
      await page.getByRole('button', { name: 'BMI', exact: true }).click()
      await expect(page.locator('.reference-band-label')).toHaveText('BMI 18,5–25 (100 kp)')
      for (const [index, selector] of selectors.entries()) {
        await expect.poll(() => page.locator(selector).boundingBox()).toEqual(before[index])
      }
      await page.getByRole('button', { name: 'Paino · 75 kg', exact: true }).click()
      for (const [index, selector] of selectors.entries()) {
        await expect.poll(() => page.locator(selector).boundingBox()).toEqual(before[index])
      }
    }
  }
})

test('chart lines and markers interpolate between modes without remounting or losing selection', async ({
  page
}) => {
  await page.goto('/?data=sample')
  await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
  await page.clock.pauseAt(pausedTime)
  await page.getByRole('button', { name: /Heikki/ }).click()
  const series = page.locator('.chart-series').first()
  const line = await series.locator('polyline').last().elementHandle()
  const before = await line!.getAttribute('points')
  await page.getByRole('button', { name: 'BMI', exact: true }).click()
  await expect(page.getByRole('button', { name: 'BMI', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(await line!.evaluate((element) => element.isConnected)).toBe(true)
  expect(await line!.getAttribute('points')).toBe(before)
  await page.clock.runFor(300)
  const halfway = await line!.getAttribute('points')
  expect(halfway).not.toBe(before)
  const markerY = await series.locator('circle').first().getAttribute('cy')
  expect(Number(halfway!.split(' ')[0].split(',')[1])).toBeCloseTo(Number(markerY), 5)
  await page.clock.runFor(400)
  const after = await line!.getAttribute('points')
  expect(after).not.toBe(before)
  expect(after).not.toBe(halfway)
  await expect(page.getByRole('button', { name: /Heikki/ })).toHaveAttribute('aria-pressed', 'true')
  await page.clock.runFor(1000)
  expect(await line!.getAttribute('points')).toBe(after)
})

test('reduced motion switches chart positions immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?data=sample')
  await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
  await page.clock.pauseAt(pausedTime)
  const line = page.locator('.chart-series').first().locator('polyline').last()
  const before = await line.getAttribute('points')
  await page.getByRole('button', { name: 'BMI', exact: true }).click()
  await expect(line).not.toHaveAttribute('points', before!)
  const after = await line.getAttribute('points')
  await page.clock.runFor(700)
  expect(await line.getAttribute('points')).toBe(after)
})
