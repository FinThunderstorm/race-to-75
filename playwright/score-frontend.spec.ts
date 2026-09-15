import { expect, test } from '@playwright/test'

const user = { id: 'one', display_name: 'Score Racer', email: 'score@example.com', role: 'member' }
const participants = [
  {
    id: user.id,
    name: user.display_name,
    heightCm: 200,
    sex: 'male',
    sbdMeasurements: [
      {
        measuredAt: '2026-08-01',
        squatKg: 100,
        benchKg: 50,
        deadliftKg: 140.045723264,
        bodyweightKg: 80
      }
    ],

    measurements: [{ measuredAt: '2026-09-07', weightKg: 120 }],
    bloodPressureMeasurements: [{ measuredAt: '2026-09-08', systolic: 160, diastolic: 100 }],
    bicepsMeasurements: [{ measuredAt: '2026-09-09', circumferenceCm: 40 }]
  },
  {
    id: 'missing',
    name: 'Missing Height',
    heightCm: null,
    sex: 'male',
    measurements: [],
    bicepsMeasurements: []
  },
  {
    id: 'weight-only',
    name: 'Weight Only',
    heightCm: 180,
    sex: 'male',
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
  await expect(page.getByRole('button', { name: /Score Racer.*89,6/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Weight Only.*Mittauksia puuttuu/ })).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Osallistujat, joilta puuttuu pituus' })
  ).toContainText('Missing Height')
  await expect(page.locator('.goal-line, .winner, .setback, .personal-low')).toHaveCount(0)
  await page.getByText('Näytä mittaukset', { exact: true }).click()
  await expect(page.locator('.race-data')).toContainText(
    'Ihmisarvo = (hauiksen osapisteet + BMI-indeksi + verenpaineindeksi + DOTS-osapisteet) / 4'
  )
  const row = page.getByRole('row', { name: /Score Racer/ })
  await expect(row).toContainText('40,0 cm (100,0 kp)')
  await expect(row).toContainText('30,0 BMI (83,3 kp)')
  await expect(row).toContainText('7.9.2026')
  await expect(row).toContainText('9.9.2026')
  await expect(row).toContainText('160,0 / 100,0 mmHg (75,0 kp)')
  await expect(row).toContainText('8.9.2026')
  await expect(page.locator('.race-data')).toContainText('90–120')
  await expect(page.locator('.race-data')).toContainText('60–80')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/score-readings-${width}.png`, fullPage: true })
  }
  await page.getByRole('link', { name: 'Lisää hauismittaus' }).click()
  await expect(page).toHaveURL(/profile\?mode=score#biceps$/)
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page).toHaveURL(/mode=score$/)
})
