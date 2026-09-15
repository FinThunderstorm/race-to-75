import { expect, test } from '@playwright/test'

test('admin saves component choices and live score uses only the selected measurements', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-09-15T12:00:00Z') })
  await page.setViewportSize({ width: 390, height: 844 })
  let components = ['bmi', 'biceps', 'blood-pressure', 'dots']
  let failLoad = true
  let failSave = true
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill({ json: { measurements: [], users: [] } })
  )
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: { id: 'one', display_name: 'Admin', email: 'admin@example.com', role: 'admin' }
    })
  )
  await page.route('**/api/profile', (route) =>
    route.fulfill({ json: { heightCm: null, sex: null } })
  )
  await page.route('**/api/admin/score-settings', (route) => {
    if (route.request().method() === 'PUT') {
      if (failSave) {
        return route.fulfill({ status: 500, json: {} })
      }
      components = route.request().postDataJSON().components
    } else if (failLoad) {
      return route.fulfill({ status: 500, json: {} })
    }
    return route.fulfill({ json: { components } })
  })
  await page.route('**/api/race', (route) =>
    route.fulfill({
      json: {
        scoreComponents: components,
        participants: [
          {
            id: 'one',
            name: 'Pressure Only',
            measurements: [],
            heightCm: null,
            sex: null,
            bloodPressureMeasurements: [{ measuredAt: '2026-09-15', systolic: 120, diastolic: 80 }]
          }
        ]
      }
    })
  )
  await page.goto('/settings?mode=score')
  const panel = page.getByRole('region', { name: 'Ihmisarvon mittarit' })
  await expect(panel.getByRole('alert')).toBeVisible()
  failLoad = false
  await panel.getByRole('button', { name: 'Yritä uudelleen' }).click()
  for (const name of ['BMI', 'Hauis', 'DOTS (SBD-tulokset)']) {
    await panel.getByRole('checkbox', { name, exact: true }).uncheck()
  }
  await panel.getByRole('checkbox', { name: 'Verenpaine', exact: true }).uncheck()
  await expect(panel.getByRole('button', { name: 'Tallenna mittarit' })).toBeDisabled()
  await panel.getByRole('checkbox', { name: 'Verenpaine', exact: true }).check()
  await panel.getByRole('button', { name: 'Tallenna mittarit' }).click()
  await expect(panel.getByRole('alert')).toContainText('tallentaminen epäonnistui')
  await expect(panel.getByRole('checkbox', { name: 'BMI', exact: true })).not.toBeChecked()
  failSave = false
  await panel.getByRole('button', { name: 'Tallenna mittarit' }).click()
  await expect(panel.getByRole('status')).toHaveText('Ihmisarvon mittarit tallennettu.')
  expect(components).toEqual(['blood-pressure'])
  await page.reload()
  await expect(panel.getByRole('checkbox', { name: 'BMI', exact: true })).not.toBeChecked()
  await expect(panel.getByRole('checkbox', { name: 'Verenpaine', exact: true })).toBeChecked()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page.getByRole('button', { name: /Pressure Only.*100,0/ })).toBeVisible()
  await page.getByText('Näytä mittaukset', { exact: true }).click()
  await expect(page.locator('.race-data')).toContainText('Ihmisarvo = (verenpaineindeksi) / 1')
  await expect(
    page.getByRole('columnheader', { name: 'Verenpaine (kp)', exact: true })
  ).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'BMI (kp)', exact: true })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'DOTS (kp)', exact: true })).toHaveCount(0)
})

test('members do not get score administration controls', async ({ page }) => {
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill({ json: { measurements: [] } })
  )
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: { id: 'one', display_name: 'Member', email: 'member@example.com', role: 'member' }
    })
  )
  await page.route('**/api/race', (route) => route.fulfill({ json: { participants: [] } }))
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Asetukset', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Ihmisarvon mittarit' })).toHaveCount(0)
})

test('radiator applies saved score components without requiring excluded profile fields', async ({
  page
}) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/radiator/access', (route) => route.fulfill({ json: { allowed: true } }))
  await page.route('**/api/radiator', (route) =>
    route.fulfill({
      json: {
        scoreComponents: ['blood-pressure'],
        participants: [
          {
            id: 'one',
            name: 'Pressure Only',
            measurements: [],
            heightCm: null,
            sex: null,
            bloodPressureMeasurements: [{ measuredAt: '2026-09-15', systolic: 120, diastolic: 80 }]
          }
        ]
      }
    })
  )
  await page.clock.install({ time: new Date('2026-09-15T12:00:00Z') })
  await page.goto('/?mode=score')
  await expect(page.getByRole('button', { name: /Pressure Only.*100,0/ })).toBeVisible()
})
