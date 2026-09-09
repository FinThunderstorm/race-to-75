import { expect, test } from '@playwright/test'

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
  await page.getByRole('combobox', { name: 'Race mode' }).selectOption('bmi')
  await expect(page).toHaveURL(/mode=bmi/)
  await expect(racer).toContainText('25.0')
  expect(
    await racer.evaluate((element) =>
      (element as HTMLElement).style.getPropertyValue('--racer-color')
    )
  ).toBe(color)
  await expect(page.locator('.goal-label')).toHaveText('25.0 BMI — REFERENCE')
  await expect(page.locator('.chart-series circle title')).toHaveText([
    'BMI Racer: 26.0 BMI · Daily average · 2026-09-07',
    'BMI Racer: 25.0 BMI · Daily average · 2026-09-09'
  ])
  await expect(page.locator('.personal-low, .setback, .winner')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Participants needing height' })).toContainText(
    'Missing Height'
  )
  await page.getByText('View live readings', { exact: true }).click()
  await expect(page.getByRole('row', { name: 'BMI Racer 26.0 25.0 -1.0 2026-09-09' })).toBeVisible()
  await expect(page.getByRole('table')).not.toContainText('kilograms')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Race mode' })).toHaveValue('bmi')
  await page.getByRole('link', { name: 'Live data', exact: true }).click()
  await expect(page).toHaveURL(/mode=bmi.*data=sample/)
  await expect(page.locator('.goal-label')).toHaveText('25.0 BMI — REFERENCE')
  await page.getByRole('link', { name: 'Sample data', exact: true }).click()
  await expect(racer).toContainText('25.0')
  await page.getByRole('combobox', { name: 'Race mode' }).selectOption('classic')
  await expect(racer).toContainText('81.0')
  await expect(page.locator('.goal-label')).toHaveText('75.0 KG — GOAL LINE')
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
  await expect(page.getByRole('status')).toHaveText('Add height in Settings to show BMI history.')
  await expect(page.getByRole('region', { name: 'Participants needing height' })).toContainText(
    'BMI Racer'
  )
  await expect(page.getByRole('link', { name: 'Add your height' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('combobox', { name: 'Race mode' }).selectOption('classic')
  await expect(page.getByRole('button', { name: /BMI Racer 81.0/ })).toBeVisible()
})

test('BMI radiator stays read-only and renders without account controls', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/radiator', (route) => route.fulfill({ json: { participants } }))
  await page.goto('/?mode=bmi&data=sample')
  await expect(page.locator('.goal-label')).toHaveText('25.0 BMI — REFERENCE')
  await expect(page.getByRole('button', { name: /BMI Racer 25.0/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Add your height|Sample data/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0)
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
  await page.getByRole('link', { name: 'Add your height' }).click()
  const panel = page.getByRole('region', { name: 'Race profile' })
  await expect(panel.getByRole('alert')).toContainText('Could not load your height')
  failLoad = false
  await panel.getByRole('button', { name: 'Retry height' }).click()
  await panel.getByRole('spinbutton', { name: 'Height (cm)' }).fill('180')
  await panel.getByRole('button', { name: 'Save height' }).click()
  await expect(panel.getByRole('alert')).toContainText('Could not save your height')
  failSave = false
  await panel.getByRole('button', { name: 'Save height' }).click()
  await expect(panel.getByRole('status')).toHaveText('Height saved.')
  await page.getByRole('link', { name: 'Back to the race' }).click()
  await expect(page).toHaveURL(/mode=bmi/)
  await expect(page.getByRole('button', { name: /BMI Racer 25.0/ })).toBeVisible()
  await page.getByRole('link', { name: 'BMI Racer', exact: true }).click()
  await panel.getByRole('spinbutton', { name: 'Height (cm)' }).fill('190')
  await panel.getByRole('button', { name: 'Save height' }).click()
  await expect(panel.getByRole('status')).toHaveText('Height saved.')
  await page.reload()
  await expect(panel.getByRole('spinbutton', { name: 'Height (cm)' })).toHaveValue('190')
  await panel.getByRole('spinbutton', { name: 'Height (cm)' }).fill('')
  await panel.getByRole('button', { name: 'Save height' }).click()
  await expect(panel.getByRole('status')).toHaveText('Height removed.')
  await page.getByRole('link', { name: 'Back to the race' }).click()
  await expect(page).toHaveURL(/\/\?mode=bmi$/)
  await expect(page.locator('.dashboard').getByRole('status')).toHaveText(
    'Add height in Settings to show BMI history.'
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
    await expect(page.getByRole('region', { name: 'Participants needing height' })).toContainText(
      'Sanna'
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/bmi-${viewport.width}.png`, fullPage: true })
  }
})
