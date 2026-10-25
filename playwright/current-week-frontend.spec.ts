import { expect, test } from '@playwright/test'

for (const width of [1440, 390]) {
  for (const today of [0, 3, 6]) {
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

for (const width of [1440, 390]) {
  test(`12 full weeks share the first three quarters and month lines use calendar dates at width ${width}`, async ({
    page
  }) => {
    await page.clock.install({ time: new Date('2026-10-25T12:00:00Z') })
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
              measurements: Array.from({ length: 13 }, (_, week) => ({
                measuredAt: new Date(Date.parse('2026-07-27') + week * 7 * 86400000).toISOString(),
                weightKg: 90 - week
              }))
            }
          ]
        }
      })
    )
    await page.goto('/?mode=classic')
    await expect(page.locator('.chart-series .chart-point')).toHaveCount(13)
    await expect(page.locator('.month-label')).toHaveText(['ELO', 'SYYS', 'LOKA'])
    const geometry = await page.locator('.race-chart svg').evaluate((svg) => ({
      left: (svg.querySelector('.goal-line') as SVGLineElement).x1.baseVal.value,
      right: (svg.querySelector('.goal-line') as SVGLineElement).x2.baseVal.value,
      week: (svg.querySelector('.current-week-line') as SVGLineElement).x1.baseVal.value,
      points: [...svg.querySelectorAll<SVGCircleElement>('.chart-series .chart-point')].map(
        (point) => point.cx.baseVal.value
      ),
      months: [...svg.querySelectorAll<SVGLineElement>('.month-line')].map(
        (line) => line.x1.baseVal.value
      )
    }))
    const plotWidth = geometry.right - geometry.left
    expect((geometry.week - geometry.left) / plotWidth).toBeCloseTo(0.75)
    for (const [week, position] of geometry.points.entries()) {
      expect((position - geometry.left) / plotWidth).toBeCloseTo(week / 16)
    }
    // August 1, September 1 and October 1 are 5, 36 and 66 days after July 27.
    for (const [index, days] of [5, 36, 66].entries()) {
      expect((geometry.months[index] - geometry.left) / plotWidth).toBeCloseTo((days / 84) * 0.75)
    }
  })
}
