import { expect, test } from '@playwright/test'

test.use({ locale: 'fi-FI', viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-15T12:00:00Z') })
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill({ json: { measurements: [] } })
  )
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: { id: 'one', display_name: 'One', email: 'one@example.com', role: 'member' }
    })
  )
  await page.route('**/api/race', (route) => route.fulfill({ json: { participants: [] } }))
  await page.route('**/api/profile', (route) =>
    route.fulfill({
      json:
        route.request().method() === 'PUT'
          ? route.request().postDataJSON()
          : { heightCm: 180, sex: 'female' }
    })
  )
  await page.goto('/settings')
})

for (const separator of [',', '.']) {
  test(`decimal fields accept ${separator} and send numeric values`, async ({ page }) => {
    const profile = page.getByRole('region', { name: 'Kisaprofiili' })
    const biceps = page.getByRole('region', { name: 'Hauismittaukset' })
    const sbd = page.getByRole('region', { name: 'SBD-tulokset' })
    for (const [panel, label, value] of [
      [profile, 'Pituus (cm)', '180.5'],
      [biceps, 'Ympärysmitta (cm)', '36.5'],
      [sbd, 'Kyykky (kg)', '180.5'],
      [sbd, 'Penkkipunnerrus (kg)', '120.5'],
      [sbd, 'Maastaveto (kg)', '200.5'],
      [sbd, 'Kehonpaino (kg)', '80.5']
    ] as const) {
      const input = panel.getByLabel(label)
      await expect(input).toHaveAttribute('inputmode', 'decimal')
      await input.fill(value.replace('.', separator))
      await expect(input).toHaveValue(value.replace('.', separator))
    }
    await expect(sbd.locator('output')).toContainText('501,5 kg')

    for (const [panel, button, path, expected] of [
      [profile, 'Tallenna profiili', '/api/profile', { heightCm: 180.5, sex: 'female' }],
      [
        biceps,
        'Lisää mittaus',
        '/api/biceps-measurements',
        { measuredAt: '2026-09-15', circumferenceCm: 36.5 }
      ],
      [
        sbd,
        'Lisää tulos',
        '/api/sbd-measurements',
        {
          measuredAt: '2026-09-15',
          squatKg: 180.5,
          benchKg: 120.5,
          deadliftKg: 200.5,
          bodyweightKg: 80.5
        }
      ]
    ] as const) {
      const submitted = page.waitForRequest(
        (request) => new URL(request.url()).pathname === path && request.method() !== 'GET'
      )
      await panel.getByRole('button', { name: button, exact: true }).click()
      expect((await submitted).postDataJSON()).toEqual(expected)
      await expect(panel.getByRole('status')).toBeVisible()
    }
  })
}

test('decimal text fields retain range and precision validation', async ({ page }) => {
  let saves = 0
  page.on('request', (request) => {
    if (['POST', 'PUT'].includes(request.method())) {
      saves += 1
    }
  })
  for (const [region, label, button, invalidValues] of [
    ['Kisaprofiili', 'Pituus (cm)', 'Tallenna profiili', ['49,9', '300.1', '180,55', '0x80']],
    ['Hauismittaukset', 'Ympärysmitta (cm)', 'Lisää mittaus', ['0,9', '100.1', '36,55', '36,5.2']],
    ['SBD-tulokset', 'Kyykky (kg)', 'Lisää tulos', ['0', '1000,1', '180.55', '1e2']],
    ['SBD-tulokset', 'Kehonpaino (kg)', 'Lisää tulos', ['0,9', '500.1', '80,55', 'abc']]
  ] as const) {
    const panel = page.getByRole('region', { name: region })
    if (region === 'SBD-tulokset') {
      for (const field of [
        'Kyykky (kg)',
        'Penkkipunnerrus (kg)',
        'Maastaveto (kg)',
        'Kehonpaino (kg)'
      ]) {
        await panel.getByLabel(field).fill('80,5')
      }
    }
    for (const invalid of invalidValues) {
      await panel.getByLabel(label).fill(invalid)
      await panel.getByRole('button', { name: button, exact: true }).click()
      await expect(panel.getByRole('alert')).toBeVisible()
    }
  }
  expect(saves).toBe(0)
})
