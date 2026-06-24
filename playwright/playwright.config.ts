import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:7500'

export default defineConfig({
  testDir: '.',
  use: {
    baseURL,
    launchOptions: {
      args: [`--unsafely-treat-insecure-origin-as-secure=${baseURL}`]
    }
  }
})
