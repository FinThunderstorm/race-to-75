import { expect, test } from '@playwright/test'

const user = { id: 'one', display_name: 'Score Racer', email: 'score@example.com', role: 'member' }
const participants = [
  {
    id: user.id,
    name: user.display_name,
    heightCm: 200,
    measurements: [{ measuredAt: '2026-09-07', weightKg: 120 }],
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
  await page.getByRole('button', { name: 'Pause automatic mode switching' }).click()
  await expect(page.getByRole('button', { name: 'Score', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.getByRole('button', { name: /Score Racer.*16.7/ })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Weight Only.*Weight and biceps needed/ })
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Participants needing height' })).toContainText(
    'Missing Height'
  )
  await expect(page.locator('.goal-line, .winner, .setback, .personal-low')).toHaveCount(0)
  await page.getByText('View live readings', { exact: true }).click()
  await expect(page.locator('.race-data')).toContainText('Score = biceps index × BMI index / 100')
  const row = page.getByRole('row', { name: /Score Racer/ })
  await expect(row).toContainText('20.0 (40.0 cm)')
  await expect(row).toContainText('83.3 (BMI 30.0)')
  await expect(row).toContainText('2026-09-07')
  await expect(row).toContainText('2026-09-09')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/score-readings-${width}.png`, fullPage: true })
  }
  await page.getByRole('link', { name: 'Add biceps measurement' }).click()
  await expect(page).toHaveURL(/settings\?mode=score#biceps$/)
  await page.getByRole('link', { name: 'Back to the race' }).click()
  await expect(page).toHaveURL(/mode=score$/)
  await page.getByRole('link', { name: 'Live data', exact: true }).click()
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
  await expect(page.getByRole('button', { name: /Score Racer.*16.7/ })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Weight Only.*Weight and biceps needed/ })
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Add your height|Add biceps measurement|Live data/ })
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0)
  await page.route('**/api/radiator', (route) =>
    route.fulfill({ json: { participants: [participants[2]] } })
  )
  await page.reload()
  await expect(page.getByRole('status')).toHaveText(
    'Weight and biceps measurements are needed to show a score.'
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
  await expect(page.getByRole('link', { name: 'Add your height' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Participants needing height' })).toContainText(
    'Score Racer'
  )
  await expect(page.locator('.chart-series')).toHaveCount(0)
  await page.getByRole('link', { name: 'Add your height' }).click()
  await expect(page).toHaveURL(/settings\?mode=biceps$/)
})
