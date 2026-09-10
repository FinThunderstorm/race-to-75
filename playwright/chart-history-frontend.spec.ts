import { expect, test } from '@playwright/test'

for (const count of [1, 11]) {
  test(`old-only biceps history spans the chart with ${count} participants`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') })
    await page.setViewportSize({ width: count === 1 ? 1440 : 390, height: 1000 })
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      (route) => route.fulfill({ json: {} })
    )
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        json: { id: 'jykke', display_name: 'Jykke', email: 'j@example.com', role: 'member' }
      })
    )
    await page.route('**/api/race', (route) =>
      route.fulfill({
        json: {
          participants: Array.from({ length: count }, (_, index) => ({
            id: `old-${index}`,
            name: `Old ${index}`,
            heightCm: 200,
            measurements: [],
            bicepsMeasurements: [{ measuredAt: '2025-02-06', circumferenceCm: 37.5 }]
          }))
        }
      })
    )
    await page.goto('/?mode=biceps')
    await page.getByRole('button', { name: 'Pause automatic mode switching' }).click()
    const series = page.locator('.chart-series')
    await expect(series).toHaveCount(count)
    const geometry = await page.locator('.race-chart svg').evaluate((svg) => {
      const width = (svg as SVGSVGElement).viewBox.baseVal.width
      return {
        left: width < 500 ? 36 : 55,
        right: width - (width < 500 ? 12 : 40),
        lines: [...svg.querySelectorAll('polyline')].map((line) =>
          [...line.points].map(({ x, y }) => ({ x, y }))
        )
      }
    })
    expect(geometry.lines).toHaveLength(count * 2)
    for (const line of geometry.lines) {
      expect(line).toHaveLength(2)
      expect(line[0].x).toBeCloseTo(geometry.left)
      expect(line[1].x).toBeCloseTo(geometry.right)
      expect(line[0].y).toBe(line[1].y)
    }
    await expect(series.first().locator('circle title')).toContainText('2025-02-06')
    await expect(
      page.getByText('No measurements in the last three months.', { exact: true })
    ).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
