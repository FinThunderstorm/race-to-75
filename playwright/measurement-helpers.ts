import type { Page } from '@playwright/test'

export const utcDate = (daysAgo = 0) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

// Keep successful requests on the real application; inject only the failure under test.
export const failNextRequest = async (page: Page, url: string, method: string) => {
  let pending = true
  await page.route(url, async (route) => {
    if (pending && route.request().method() === method) {
      pending = false
      await route.fulfill({ status: 500, json: {} })
    } else {
      await route.fallback()
    }
  })
}
