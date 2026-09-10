import { expect, test } from '@playwright/test'

const user = { id: 'one', display_name: 'Mittari', email: 'metric@example.com', role: 'member' }
const participant = {
  id: user.id,
  name: user.display_name,
  heightCm: 200,
  measurements: [{ measuredAt: '2026-09-09', weightKg: 120 }],
  bicepsMeasurements: [{ measuredAt: '2026-09-09', circumferenceCm: 40 }],
  bloodPressureMeasurements: [{ measuredAt: '2026-09-09', systolic: 160, diastolic: 100 }]
}

test('every chart mode leaves room above and below readings on desktop and mobile', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }))
  await page.route('**/api/race', (route) =>
    route.fulfill({ json: { participants: [participant] } })
  )
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const mode of ['classic', 'bmi', 'biceps', 'blood-pressure', 'score']) {
      await page.goto(`/?mode=${mode}`)
      await expect(page.locator('.chart-series circle').first()).toBeVisible()
      await expect
        .poll(() =>
          page.locator('.race-chart svg').evaluate((svg) => {
            const height = (svg as SVGSVGElement).viewBox.baseVal.height - 40
            return [...svg.querySelectorAll<SVGCircleElement>('.chart-series circle')].every(
              (circle) => {
                const position = circle.cy.baseVal.value / height
                return position >= 0.045 && position <= 0.955
              }
            )
          })
        )
        .toBe(true)
    }
  }
})

test('raw metrics show component points and full scoring bands on desktop and mobile', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') })
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }))
  await page.route('**/api/race', (route) =>
    route.fulfill({ json: { participants: [participant] } })
  )
  await page.route('**/api/radiator/access', (route) => route.fulfill({ json: { allowed: false } }))
  await page.route('**/api/integrations/eufy/status', (route) =>
    route.fulfill({ json: { status: 'disconnected' } })
  )
  for (const [mode, value, points, labels] of [
    ['bmi', '30,0', '83,3', ['BMI 18,5–25 (100 kp)']],
    ['biceps', '40,0', '20,0', []],
    ['blood-pressure', '160,0 / 100,0', '75,0', ['Yläpaine 90–120 mmHg', 'Alapaine 60–80 mmHg']]
  ] as const) {
    await page.goto(`/?mode=${mode}`)
    await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
    const racer = page.getByRole('button', { name: /Mittari/ })
    await expect(racer).toContainText(value)
    await expect(racer).toContainText(`(${points} kp)`)
    await expect(page.locator('.chart-series circle title').first()).toContainText(`(${points} kp)`)
    await expect(page.locator('.reference-band-label')).toHaveText([...labels])
    await page.getByText('Näytä mittaukset', { exact: true }).click()
    await expect(page.getByRole('row', { name: /Mittari/ })).toContainText(`(${points} kp)`)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      const bands = await page.locator('.race-chart svg').evaluate((svg) => ({
        plotHeight: (svg as SVGSVGElement).viewBox.baseVal.height - 40,
        rects: [...svg.querySelectorAll<SVGRectElement>('.reference-band rect')].map((rect) => ({
          y: rect.y.baseVal.value,
          height: rect.height.baseVal.value,
          width: rect.width.baseVal.value,
          opacity: Number(rect.getAttribute('fill-opacity'))
        }))
      }))
      for (const band of bands.rects) {
        expect(band.y).toBeGreaterThanOrEqual(0)
        expect(band.height).toBeGreaterThan(0)
        expect(band.y + band.height).toBeLessThanOrEqual(bands.plotHeight)
        expect(band.width).toBeGreaterThan(100)
        expect(band.opacity).toBeLessThan(0.15)
      }
      await page.screenshot({ path: `test-results/raw-${mode}-${width}.png`, fullPage: true })
    }
  }
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/radiator', (route) =>
    route.fulfill({ json: { participants: [participant] } })
  )
  await page.goto('/?mode=blood-pressure')
  await expect(page.getByRole('button', { name: /Mittari/ })).toContainText('(75,0 kp)')
  await expect(page.locator('.reference-band')).toHaveCount(2)
  await expect(page.getByRole('link', { name: 'Lisää verenpainemittaus' })).toHaveCount(0)
})

test('wrapped component labels do not overlap at desktop widths', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') })
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }))
  for (const [width, height, count] of [
    [1280, 1000, 6],
    [1440, 1000, 6],
    [1280, 720, 10]
  ]) {
    await page.setViewportSize({ width, height })
    await page.route('**/api/race', (route) =>
      route.fulfill({
        json: {
          participants: Array.from({ length: count }, (_, index) => ({
            ...participant,
            id: `person-${index}`,
            name: `Osallistuja ${index + 1}`
          }))
        }
      })
    )
    await page.goto(count === 10 ? '/?mode=blood-pressure' : '/?mode=blood-pressure&data=sample')
    await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
    await expect
      .poll(() =>
        page.locator('.race-standings .participant').evaluateAll((elements) => {
          const boxes = elements
            .map((element) => element.getBoundingClientRect())
            .sort((a, b) => a.top - b.top)
          return boxes.every((box, index) => index === 0 || box.top >= boxes[index - 1].bottom + 4)
        })
      )
      .toBe(true)
  }
})
