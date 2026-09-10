import { expect, test } from '@playwright/test'

const user = { id: 'one', display_name: 'Score Racer', email: 'score@example.com', role: 'member' }
const participants = [
  {
    id: user.id,
    name: user.display_name,
    heightCm: 200,
    measurements: [{ measuredAt: '2026-09-07', weightKg: 120 }],
    bloodPressureMeasurements: [{ measuredAt: '2026-09-08', systolic: 160, diastolic: 100 }],
    bicepsMeasurements: [{ measuredAt: '2026-09-09', circumferenceCm: 40 }]
  },
  {
    id: 'missing',
    name: 'Missing Height',
    heightCm: null,
    measurements: [],
    bicepsMeasurements: []
  },
  {
    id: 'weight-only',
    name: 'Weight Only',
    heightCm: 180,
    measurements: [{ measuredAt: '2026-09-08', weightKg: 80 }],
    bicepsMeasurements: []
  }
]

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') })
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }))
  await page.route('**/api/race', (route) => route.fulfill({ json: { participants } }))
})

test('Score shows the combined index, formulas and dated components, and preserves its mode', async ({
  page
}) => {
  await page.goto('/?mode=score')
  await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
  await expect(page.getByRole('button', { name: 'Ihmisarvo', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.getByRole('button', { name: /Score Racer.*12,5/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Weight Only.*Mittauksia puuttuu/ })).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Osallistujat, joilta puuttuu pituus' })
  ).toContainText('Missing Height')
  await expect(page.locator('.goal-line, .winner, .setback, .personal-low')).toHaveCount(0)
  await page.getByText('Näytä mittaukset', { exact: true }).click()
  await expect(page.locator('.race-data')).toContainText(
    'Ihmisarvo = hauisindeksi × BMI-indeksi × verenpaineindeksi / 10 000'
  )
  const row = page.getByRole('row', { name: /Score Racer/ })
  await expect(row).toContainText('20,0 (40,0 cm)')
  await expect(row).toContainText('83,3 (BMI 30,0)')
  await expect(row).toContainText('7.9.2026')
  await expect(row).toContainText('9.9.2026')
  await expect(row).toContainText('75,0 (160,0 / 100,0 mmHg)')
  await expect(row).toContainText('8.9.2026')
  await expect(page.locator('.race-data')).toContainText('90–120')
  await expect(page.locator('.race-data')).toContainText('60–80')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/score-readings-${width}.png`, fullPage: true })
  }
  await page.getByRole('link', { name: 'Lisää hauismittaus' }).click()
  await expect(page).toHaveURL(/settings\?mode=score#biceps$/)
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page).toHaveURL(/mode=score$/)
  await page.getByRole('link', { name: 'Ryhmän mittaukset', exact: true }).click()
  await expect(page).toHaveURL(/mode=score.*data=sample/)
  await expect(page.locator('.chart-series')).toHaveCount(5)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/score-${width}.png`, fullPage: true })
  }
})

test('Score radiator is read-only and missing components never become a partial score', async ({
  page
}) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/radiator', (route) => route.fulfill({ json: { participants } }))
  await page.goto('/?mode=score')
  await expect(page.getByRole('button', { name: /Score Racer.*12,5/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Weight Only.*Mittauksia puuttuu/ })).toBeVisible()
  await expect(
    page.getByRole('link', {
      name: /Lisää pituutesi|Lisää hauismittaus|Lisää verenpainemittaus|Ryhmän mittaukset/
    })
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Kirjaudu ulos' })).toHaveCount(0)
  await page.route('**/api/radiator', (route) =>
    route.fulfill({ json: { participants: [participants[2]] } })
  )
  await page.reload()
  await expect(page.getByRole('status')).toHaveText(
    'Ihmisarvon näyttämiseen tarvitaan paino-, hauis- ja verenpainemittaus.'
  )
  await expect(page.locator('.chart-series')).toHaveCount(0)
})

test('biceps without height directs the owner to settings instead of plotting centimetres as points', async ({
  page
}) => {
  await page.route('**/api/race', (route) =>
    route.fulfill({
      json: {
        participants: [{ ...participants[0], heightCm: null }]
      }
    })
  )
  await page.goto('/?mode=biceps')
  await expect(page.getByRole('link', { name: 'Lisää pituutesi' })).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Osallistujat, joilta puuttuu pituus' })
  ).toContainText('Score Racer')
  await expect(page.locator('.chart-series')).toHaveCount(0)
  await page.getByRole('link', { name: 'Lisää pituutesi' }).click()
  await expect(page).toHaveURL(/settings\?mode=biceps$/)
})

test('missing blood pressure prompts entry and a manual reading enables the score', async ({
  page
}) => {
  let pressure: { id: string; measuredAt: string; systolic: number; diastolic: number }[] = []
  await page.route('**/api/race', (route) =>
    route.fulfill({
      json: {
        participants: [{ ...participants[0], bloodPressureMeasurements: pressure }]
      }
    })
  )
  await page.route('**/api/blood-pressure-measurements', (route) => {
    if (route.request().method() === 'POST') {
      pressure = [{ id: 'pressure-one', ...route.request().postDataJSON() }]
      return route.fulfill({ status: 201, json: pressure[0] })
    }
    return route.fulfill({ json: { measurements: pressure } })
  })
  await page.goto('/?mode=score')
  await expect(page.locator('.chart-series')).toHaveCount(0)
  await page.getByRole('link', { name: 'Lisää verenpainemittaus' }).click()
  await expect(page).toHaveURL(/settings\?mode=score#blood-pressure$/)
  const panel = page.getByRole('region', { name: 'Verenpainemittaukset' })
  await panel.getByLabel('Yläpaine (mmHg)').fill('160')
  await panel.getByLabel('Alapaine (mmHg)').fill('100')
  await panel.getByRole('button', { name: 'Lisää mittaus', exact: true }).click()
  await expect(panel.getByRole('status')).toHaveText('Mittaus lisätty.')
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page).toHaveURL(/mode=score$/)
  await expect(page.getByRole('button', { name: /Score Racer.*12,5/ })).toBeVisible()
})
