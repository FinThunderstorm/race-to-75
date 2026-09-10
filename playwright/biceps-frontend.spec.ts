import { expect, test } from '@playwright/test'

const user = {
  id: 'biceps-user',
  display_name: 'Biceps Racer',
  email: 'biceps@example.com',
  role: 'member'
}

test('users add and remove their measurements and return to the biceps chart', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') })
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }))
  await page.route('**/api/profile', (route) => route.fulfill({ json: { heightCm: 180 } }))
  let measurements: { id: string; measuredAt: string; circumferenceCm: number }[] = []
  let failSave = false
  await page.route('**/api/biceps-measurements', async (route) => {
    if (route.request().method() === 'POST') {
      if (failSave) {
        return route.fulfill({ status: 500, json: {} })
      }
      const reading = { id: 'reading-one', ...route.request().postDataJSON() }
      measurements = [reading, ...measurements]
      return route.fulfill({ status: 201, json: reading })
    }
    return route.fulfill({ json: { measurements } })
  })
  await page.route('**/api/biceps-measurements/reading-one', (route) => {
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
            heightCm: 180,
            measurements: [],
            bicepsMeasurements: measurements
          }
        ]
      }
    })
  )
  await page.goto('/?mode=biceps')
  await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
  await expect(page.getByText('Ei vielä hauismittauksia.', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Lisää hauismittaus' }).click()
  const panel = page.getByRole('region', { name: 'Hauismittaukset' })
  await expect(panel.getByText('Ei vielä mittauksia.', { exact: true })).toBeVisible()
  await panel.getByLabel('Ympärysmitta (cm)').fill('36.5')
  await panel.getByLabel('Mittauspäivä (UTC)').fill('2026-09-09')
  failSave = true
  await panel.getByRole('button', { name: 'Lisää mittaus', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('tallentaminen epäonnistui')
  await expect(panel.getByLabel('Ympärysmitta (cm)')).toHaveValue('36.5')
  failSave = false
  await panel.getByRole('button', { name: 'Lisää mittaus', exact: true }).click()
  await expect(panel.getByRole('status')).toHaveText('Mittaus lisätty.')
  await expect(panel.getByRole('row', { name: /9.9.2026 36,5/ })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/biceps-settings-390.png', fullPage: true })
  await page.reload()
  await expect(panel.getByRole('row', { name: /9.9.2026 36,5/ })).toBeVisible()
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page).toHaveURL(/mode=biceps$/)
  await expect(page.getByRole('button', { name: /Biceps Racer.*20,3/ })).toBeVisible()
  await expect(page.locator('.goal-line, .winner, .setback, .personal-low')).toHaveCount(0)
  await page.getByText('Näytä mittaukset', { exact: true }).click()
  await expect(page.getByRole('table')).toContainText('indeksipisteinä')
  await page.getByRole('link', { name: 'Lisää hauismittaus' }).click()
  await panel.getByRole('button', { name: /Poista mittaus/ }).click()
  await expect(panel.getByRole('status')).toHaveText('Mittaus poistettu.')
  await expect(panel.getByText('Ei vielä mittauksia.', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page.getByText('Ei vielä hauismittauksia.', { exact: true })).toBeVisible()
})

test('biceps supports sample data, mobile layout, and read-only radiator without weight readings', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') })
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }))
  await page.goto('/?mode=biceps&data=sample')
  await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
  await expect(page.locator('.chart-series')).toHaveCount(5)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/biceps-${width}.png`, fullPage: true })
  }
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/radiator', (route) =>
    route.fulfill({
      json: {
        participants: [
          {
            id: user.id,
            name: user.display_name,
            heightCm: 180,
            measurements: [],
            bicepsMeasurements: [{ measuredAt: '2026-09-09', circumferenceCm: 36.5 }]
          }
        ]
      }
    })
  )
  await page.goto('/?mode=biceps')
  await expect(page.getByRole('button', { name: /Biceps Racer.*20,3/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Lisää hauismittaus' })).toHaveCount(0)
})
