import { expect, test } from '@playwright/test'

for (const width of [1440, 390]) {
  for (let today = 0; today < 7; today += 1) {
    test(`current-week points keep weekday positions on day ${today + 1} at width ${width}`, async ({
      page
    }) => {
      const monday = Date.parse('2026-09-14T12:00:00Z')
      const day = 24 * 60 * 60 * 1000
      await page.clock.install({ time: new Date(monday + today * day) })
      await page.setViewportSize({ width, height: 1000 })
      await page.route(
        (url) => url.pathname.startsWith('/api/'),
        (route) => route.fulfill({ json: {} })
      )
      await page.route('**/api/auth/me', (route) =>
        route.fulfill({
          json: { id: 'one', display_name: 'One', email: 'one@example.com', role: 'member' }
        })
      )
      await page.route('**/api/race', (route) =>
        route.fulfill({
          json: {
            participants: [
              {
                id: 'one',
                name: 'One',
                measurements: Array.from({ length: today + 1 }, (_, index) => ({
                  measuredAt: new Date(monday + index * day).toISOString(),
                  weightKg: 90 - index
                }))
              }
            ]
          }
        })
      )
      await page.goto('/?data=live&mode=classic')
      await expect(page.locator('.chart-series .chart-point')).toHaveCount(today + 1)
      const geometry = await page.locator('.race-chart svg').evaluate((element) => {
        const svg = element as SVGSVGElement
        return {
          weekStart: svg.querySelector<SVGLineElement>('.current-week-line')!.x1.baseVal.value,
          right: svg.querySelector<SVGLineElement>('.goal-line')!.x2.baseVal.value,
          points: [...svg.querySelectorAll<SVGCircleElement>('.chart-series .chart-point')].map(
            (circle) => circle.cx.baseVal.value
          )
        }
      })
      for (const [weekday, x] of geometry.points.entries()) {
        expect((x - geometry.weekStart) / (geometry.right - geometry.weekStart)).toBeCloseTo(
          weekday / 6
        )
      }
    })
  }
}
