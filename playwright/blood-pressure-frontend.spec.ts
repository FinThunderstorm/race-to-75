import { expect, test } from '@playwright/test'

const user = {
  id: 'blood-pressure-user',
  display_name: 'BloodPressure Racer',
  email: 'blood-pressure@example.com',
  role: 'member'
}

test('users add and remove their measurements and return to the blood-pressure chart', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') })
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }))
  await page.route('**/api/profile', (route) => route.fulfill({ json: { heightCm: 180 } }))
  let measurements: { id: string; measuredAt: string; systolic: number; diastolic: number }[] = []
  let failSave = false
  let failDelete = false
  await page.route('**/api/blood-pressure-measurements', async (route) => {
    if (route.request().method() === 'POST') {
      if (failSave) {
        return route.fulfill({ status: 500, json: {} })
      }
      expect(route.request().postDataJSON()).toEqual({
        measuredAt: '2026-09-09',
        systolic: 125,
        diastolic: 82
      })
      const reading = { id: 'reading-one', ...route.request().postDataJSON() }
      measurements = [reading, ...measurements]
      return route.fulfill({ status: 201, json: reading })
    }
    return route.fulfill({ json: { measurements } })
  })
  await page.route('**/api/blood-pressure-measurements/reading-one', (route) => {
    if (failDelete) {
      return route.fulfill({ status: 500, json: {} })
    }
    measurements = []
    return route.fulfill({ status: 204 })
  })
  await page.route('**/api/race', (route) =>
    route.fulfill({
      json: {
        participants: [
          {
            id: user.id,
            name: user.display_name,
            heightCm: null,
            measurements: [],
            bloodPressureMeasurements: measurements
          }
        ]
      }
    })
  )
  await page.goto('/?mode=blood-pressure')
  await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
  await expect(page.getByText('Ei vielä verenpainemittauksia.', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Lisää verenpainemittaus' }).click()
  const panel = page.getByRole('region', { name: 'Verenpainemittaukset' })
  await expect(panel.getByText('Ei vielä mittauksia.', { exact: true })).toBeVisible()
  await panel.getByLabel('Yläpaine (mmHg)').fill('125')
  await panel.getByLabel('Alapaine (mmHg)').fill('82')
  await panel.getByLabel('Mittauspäivä (UTC)').fill('2026-09-09')
  await panel.getByLabel('Alapaine (mmHg)').fill('130')
  await panel.getByRole('button', { name: 'Lisää mittaus', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText(
    'Yläpaineen on oltava alapaineen yläpuolella'
  )
  await panel.getByLabel('Alapaine (mmHg)').fill('82')
  failSave = true
  await panel.getByRole('button', { name: 'Lisää mittaus', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('tallentaminen epäonnistui')
  await expect(panel.getByLabel('Yläpaine (mmHg)')).toHaveValue('125')
  failSave = false
  await panel.getByRole('button', { name: 'Lisää mittaus', exact: true }).click()
  await expect(panel.getByRole('status')).toHaveText('Mittaus lisätty.')
  await expect(panel.getByRole('row', { name: /9.9.2026 125.*82/ })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/blood-pressure-settings-390.png', fullPage: true })
  await page.reload()
  await expect(panel.getByRole('row', { name: /9.9.2026 125.*82/ })).toBeVisible()
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page).toHaveURL(/mode=blood-pressure$/)
  await expect(page.getByRole('button', { name: /BloodPressure Racer.*125,0.*82,0/ })).toBeVisible()
  await expect(page.locator('.diastolic-series')).toHaveCount(1)
  await expect(page.locator('.goal-line, .winner, .setback, .personal-low')).toHaveCount(0)
  await page.getByText('Näytä mittaukset', { exact: true }).click()
  await expect(page.getByRole('table')).toContainText('mmHg')
  await page.getByRole('link', { name: 'Lisää verenpainemittaus' }).click()
  failDelete = true
  await panel.getByRole('button', { name: /Poista mittaus/ }).click()
  await expect(panel.getByRole('alert')).toContainText('poistaminen epäonnistui')
  await expect(panel.getByRole('row', { name: /9.9.2026 125.*82/ })).toBeVisible()
  failDelete = false
  await panel.getByRole('button', { name: /Poista mittaus/ }).click()
  await expect(panel.getByRole('status')).toHaveText('Mittaus poistettu.')
  await expect(panel.getByText('Ei vielä mittauksia.', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page.getByText('Ei vielä verenpainemittauksia.', { exact: true })).toBeVisible()
})

test('blood-pressure supports sample data, mobile layout, and read-only radiator without weight readings', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') })
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }))
  await page.goto('/?mode=blood-pressure&data=sample')
  await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
  await expect(page.getByRole('button', { name: 'Verenpaine', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.locator('.chart-series')).toHaveCount(6)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/blood-pressure-${width}.png`, fullPage: true })
  }
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/radiator', (route) =>
    route.fulfill({
      json: {
        participants: [
          {
            id: user.id,
            name: user.display_name,
            heightCm: null,
            measurements: [],
            bloodPressureMeasurements: [{ measuredAt: '2026-09-09', systolic: 125, diastolic: 82 }]
          }
        ]
      }
    })
  )
  await page.goto('/?mode=blood-pressure')
  await expect(page.getByRole('button', { name: /BloodPressure Racer.*125,0.*82,0/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Lisää verenpainemittaus' })).toHaveCount(0)
})
