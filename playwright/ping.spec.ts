import { expect, test } from '@playwright/test'

test('GET /ping returns pong', async ({ request }) => {
  const response = await request.get('/ping')

  expect(response.ok()).toBeTruthy()
  expect(await response.text()).toBe('pong')
})
