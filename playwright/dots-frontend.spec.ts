import { expect, test } from '@playwright/test'

const user = {
  id: 'dots-user',
  display_name: 'Dots Racer',
  email: 'dots@example.com',
  role: 'member'
}

test('profile sex, dated weight prefill, separate lifts, preview, save retry and deletion', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-09-11T12:00:00Z') })
  let profile = { heightCm: 200, sex: null as string | null }
  let readings: {
    id: string
    measuredAt: string
    squatKg: number
    benchKg: number
    deadliftKg: number
    bodyweightKg: number
  }[] = []
  let failSave = false
  let failDelete = false
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill({ json: { measurements: [] } })
  )
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }))
  await page.route('**/api/profile', (route) => {
    if (route.request().method() === 'PUT') {
      profile = route.request().postDataJSON()
    }
    return route.fulfill({ json: profile })
  })
  await page.route('**/api/race', (route) =>
    route.fulfill({
      json: {
        participants: [
          {
            id: user.id,
            name: user.display_name,
            ...profile,
            measurements: [
              { measuredAt: '2026-09-11T08:00:00Z', weightKg: 100 },
              { measuredAt: '2026-09-09T08:00:00Z', weightKg: 80 },
              { measuredAt: '2026-09-12T08:00:00Z', weightKg: 90 }
            ],
            bicepsMeasurements: [{ measuredAt: '2026-09-01', circumferenceCm: 40 }],
            bloodPressureMeasurements: [{ measuredAt: '2026-09-01', systolic: 120, diastolic: 80 }],
            sbdMeasurements: readings
          }
        ]
      }
    })
  )
  await page.route('**/api/sbd-measurements', (route) => {
    if (route.request().method() === 'POST') {
      if (failSave) {
        return route.fulfill({ status: 500, json: {} })
      }
      expect(route.request().postDataJSON()).toEqual({
        measuredAt: '2026-09-09',
        squatKg: 180,
        benchKg: 120,
        deadliftKg: 200,
        bodyweightKg: 80
      })
      const reading = { id: 'sbd-one', ...route.request().postDataJSON() }
      readings = [reading]
      return route.fulfill({ status: 201, json: reading })
    }
    return route.fulfill({ json: { measurements: readings } })
  })
  await page.route('**/api/sbd-measurements/sbd-one', (route) => {
    if (failDelete) {
      return route.fulfill({ status: 500, json: {} })
    }
    readings = []
    return route.fulfill({ status: 204 })
  })
  await page.goto('/settings?mode=dots#sbd')
  const panel = page.getByRole('region', { name: 'SBD-tulokset' })
  await expect(panel.getByRole('button', { name: 'Lisää tulos', exact: true })).toBeDisabled()
  const profilePanel = page.getByRole('region', { name: 'Kisaprofiili' })
  await profilePanel.getByLabel('Sukupuoli').selectOption('female')
  await profilePanel.getByRole('button', { name: 'Tallenna profiili' }).click()
  await expect(profilePanel.getByRole('status')).toHaveText('Profiili tallennettu.')
  await expect(panel.getByLabel('Kehonpaino (kg)')).toHaveValue('100')
  await panel.getByLabel('Tulospäivä (UTC)').fill('2026-09-09')
  await expect(panel.getByLabel('Kehonpaino (kg)')).toHaveValue('80')
  await panel.getByLabel('Kehonpaino (kg)').fill('77')
  await panel.getByLabel('Tulospäivä (UTC)').fill('2026-09-08')
  await expect(panel.getByLabel('Kehonpaino (kg)')).toHaveValue('77')
  await panel.getByLabel('Tulospäivä (UTC)').fill('2026-09-09')
  await panel.getByLabel('Kehonpaino (kg)').fill('80')
  await panel.getByLabel('Kyykky (kg)').fill('180')
  await panel.getByLabel('Penkkipunnerrus (kg)').fill('120')
  await panel.getByLabel('Maastaveto (kg)').fill('200')
  await expect(panel.locator('output')).toContainText('500,0 kg')
  await expect(panel.locator('output')).toContainText('471,1 DOTS')
  await expect(panel.locator('output')).toContainText('Elite / National Level')
  failSave = true
  await panel.getByRole('button', { name: 'Lisää tulos', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('tallentaminen epäonnistui')
  await expect(panel.getByLabel('Kyykky (kg)')).toHaveValue('180')
  failSave = false
  await panel.getByRole('button', { name: 'Lisää tulos', exact: true }).click()
  await expect(panel.getByRole('status')).toHaveText('Tulos lisätty.')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/dots-settings-${width}.png`, fullPage: true })
  }
  await page.reload()
  await expect(
    panel.getByRole('row', { name: /9.9.2026.*180,0.*120,0.*200,0.*80,0.*471,1/ })
  ).toBeVisible()
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page).toHaveURL(/mode=dots/)
  await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
  await expect(page.getByRole('button', { name: /Dots Racer.*471,1/ })).toBeVisible()
  await page.getByText('Näytä mittaukset', { exact: true }).click()
  await expect(page.getByRole('table', { name: 'DOTS-tasorajat' })).toContainText('325')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/dots-chart-${width}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: 'Ihmisarvo', exact: true }).click()
  await expect(page.getByRole('button', { name: /Dots Racer.*153,5/ })).toBeVisible()
  await page.getByRole('link', { name: 'Lisää SBD-tulos' }).click()
  failDelete = true
  await panel.getByRole('button', { name: /Poista tulos/ }).click()
  await expect(panel.getByRole('alert')).toContainText('poistaminen epäonnistui')
  failDelete = false
  await panel.getByRole('button', { name: /Poista tulos/ }).click()
  await expect(panel.getByRole('status')).toHaveText('Tulos poistettu.')
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page.locator('.chart-series')).toHaveCount(0)
})

test('DOTS sample and radiator work without height, and missing sex is explained', async ({
  page
}) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/radiator/access', (route) => route.fulfill({ json: { allowed: true } }))
  await page.route('**/api/radiator', (route) =>
    route.fulfill({
      json: {
        participants: [
          {
            id: 'missing',
            name: 'Missing Sex',
            heightCm: null,
            sex: null,
            measurements: [],
            sbdMeasurements: []
          }
        ]
      }
    })
  )
  await page.goto('/?mode=dots')
  await expect(page.getByRole('button', { name: /Missing Sex.*Sukupuoli tarvitaan/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Lisää SBD-tulos' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Lisää pituutesi' })).toHaveCount(0)
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }))
  await page.goto('/?mode=dots&data=sample')
  await expect(page.locator('.chart-series')).toHaveCount(6)
})
