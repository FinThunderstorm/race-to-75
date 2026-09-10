import { expect, type Page, test } from '@playwright/test'

const previewUser = {
  id: 'preview-user',
  email: 'preview@example.com',
  display_name: 'Preview Racer',
  role: 'member'
}

test.use({
  browserName: 'firefox',
  launchOptions: { args: [] },
  viewport: { width: 1600, height: 1000 }
})

const expectUndistortedChart = async (page: Page) => {
  await expect(async () => {
    const geometry = await page.locator('.race-chart svg').evaluate((element) => {
      const svg = element as SVGSVGElement
      const transform = svg.getScreenCTM()!
      const circles = [...svg.querySelectorAll('circle')].map((circle) => {
        const box = circle.getBoundingClientRect()
        const style = getComputedStyle(circle)
        const stroke = style.stroke === 'none' ? 0 : Number.parseFloat(style.strokeWidth)
        return {
          width: box.width,
          height: box.height,
          diameter: circle.r.baseVal.value * 2 + stroke
        }
      })
      const goal = svg.querySelector<SVGLineElement>('.goal-line')!
      const goalStyle = getComputedStyle(goal)
      const labelTransform = svg.querySelector<SVGTextElement>('.goal-label')!.getScreenCTM()!
      return {
        scaleX: transform.a,
        scaleY: transform.d,
        circles,
        goalStroke: goalStyle.strokeWidth,
        goalDashes: goalStyle.strokeDasharray,
        labelScaleX: labelTransform.a,
        labelScaleY: labelTransform.d
      }
    })
    expect(geometry.scaleX).toBeCloseTo(1, 3)
    expect(geometry.scaleY).toBeCloseTo(1, 3)
    expect(geometry.circles.length).toBeGreaterThan(0)
    for (const circle of geometry.circles) {
      // Firefox rounds painted bounds to subpixels, including the antialiased edge.
      expect(Math.abs(circle.width - circle.height)).toBeLessThan(0.1)
      expect(Math.abs(circle.width - circle.diameter)).toBeLessThan(0.1)
      expect(Math.abs(circle.height - circle.diameter)).toBeLessThan(0.1)
    }
    expect(geometry.goalStroke).toBe('1px')
    expect(geometry.goalDashes).toBe('8px, 8px')
    expect(geometry.labelScaleX).toBeCloseTo(1, 3)
    expect(geometry.labelScaleY).toBeCloseTo(1, 3)
  }).toPass()
}

test('BMI uses the same undistorted chart geometry on desktop and mobile', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: previewUser }))
  await page.goto('/?mode=bmi&data=sample')
  await expect(page.locator('.goal-label')).toHaveText('100 PISTETTÄ — BMI 18,5–25')
  for (const viewport of [
    { width: 1600, height: 1000 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport)
    await expectUndistortedChart(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('live data retains the preview chart size and character when participants have no recent readings', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') })
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: previewUser }))
  await page.route('**/api/race', (route) =>
    route.fulfill({
      json: {
        participants: [
          {
            id: 'recent',
            name: 'Recent Racer',
            measurements: [{ measuredAt: '2026-09-09T08:00:00Z', weightKg: 82 }]
          },
          {
            id: 'old',
            name: 'Old Racer',
            measurements: [{ measuredAt: '2020-01-01T08:00:00Z', weightKg: 95 }]
          },
          { id: 'empty', name: 'New Racer', measurements: [] }
        ]
      }
    })
  )
  await page.goto('/?data=sample')
  await expect(page.locator('.race-art img')).toBeVisible()
  await expectUndistortedChart(page)
  const preview = await page.locator('.race-chart').boundingBox()
  await page.getByRole('link', { name: 'Esimerkkimittaukset' }).click()
  await expect(page.getByRole('button', { name: /Recent Racer/ })).toBeVisible()
  await expect(page.locator('.race-art img')).toBeVisible()
  const live = await page.locator('.race-chart').boundingBox()
  expect(live).toEqual(preview)
  await expectUndistortedChart(page)
  const recent = await page.getByRole('button', { name: /Recent Racer/ }).boundingBox()
  expect(recent!.x).toBeGreaterThanOrEqual(live!.x + live!.width - 1)
  const absent = page.getByRole('region', { name: 'Osallistujat, joilta puuttuu mittauksia' })
  await expect(
    page.locator('.race-standings').getByRole('button', { name: /Old Racer/ })
  ).toBeVisible()
  await expect(absent.getByRole('button', { name: /New Racer/ })).toBeVisible()
  expect((await absent.boundingBox())!.y).toBeGreaterThanOrEqual(live!.y + live!.height)

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
    { width: 1920, height: 1080 }
  ]) {
    await page.setViewportSize(viewport)
    await expectUndistortedChart(page)
    await expect(page.getByRole('button', { name: /Recent Racer/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})
