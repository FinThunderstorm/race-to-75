import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:7500'
  }
})
