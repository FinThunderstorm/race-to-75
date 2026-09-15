import { expect, test } from './app-fixtures'
import { failNextRequest, utcDate } from './measurement-helpers'

test('admin score choices survive retries and reloads, then control the real race and public radiator', async ({
  page,
  context,
  application,
  signIn
}) => {
  const user = await signIn('admin')
  await application.sql`
    INSERT INTO blood_pressure_measurement (user_id, measured_at, systolic, diastolic)
    VALUES (${user.id}, ${utcDate()}, 120, 80)
  `
  const [original] = await application.sql`SELECT components FROM score_settings`
  try {
    await page.setViewportSize({ width: 390, height: 844 })
    await failNextRequest(page, '**/api/admin/score-settings', 'GET')
    await page.goto('/admin?mode=score')
    const panel = page.getByRole('region', { name: 'Ihmisarvon mittarit' })
    await expect(panel.getByRole('alert')).toBeVisible()
    await panel.getByRole('button', { name: 'Yritä uudelleen' }).click()
    for (const name of ['BMI', 'Hauis', 'DOTS (SBD-tulokset)', 'Verenpaine']) {
      await panel.getByRole('checkbox', { name, exact: true }).uncheck()
    }
    await expect(panel.getByRole('button', { name: 'Tallenna mittarit' })).toBeDisabled()
    await panel.getByRole('checkbox', { name: 'Verenpaine', exact: true }).check()
    await failNextRequest(page, '**/api/admin/score-settings', 'PUT')
    await panel.getByRole('button', { name: 'Tallenna mittarit' }).click()
    await expect(panel.getByRole('alert')).toContainText('tallentaminen epäonnistui')
    await expect(panel.getByRole('checkbox', { name: 'BMI', exact: true })).not.toBeChecked()
    await panel.getByRole('button', { name: 'Tallenna mittarit' }).click()
    await expect(panel.getByRole('status')).toHaveText('Ihmisarvon mittarit tallennettu.')
    expect(await application.sql`SELECT components FROM score_settings`).toEqual([
      { components: ['blood-pressure'] }
    ])
    await page.reload()
    for (const name of ['BMI', 'Hauis', 'DOTS (SBD-tulokset)']) {
      await expect(panel.getByRole('checkbox', { name, exact: true })).not.toBeChecked()
    }
    await expect(panel.getByRole('checkbox', { name: 'Verenpaine', exact: true })).toBeChecked()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
    await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
    await expect(
      page.getByRole('button', { name: new RegExp(`${user.displayName}.*100,0`) })
    ).toBeVisible()
    await page.getByText('Näytä mittaukset', { exact: true }).click()
    await expect(page.locator('.race-data')).toContainText('Ihmisarvo = (verenpaineindeksi) / 1')
    await expect(
      page.getByRole('columnheader', { name: 'Verenpaine (kp)', exact: true })
    ).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'BMI (kp)', exact: true })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'DOTS (kp)', exact: true })).toHaveCount(0)

    await context.clearCookies()
    const radiator = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/radiator'
    )
    await page.goto('/?mode=score')
    expect((await radiator).status()).toBe(200)
    await expect(
      page.getByRole('button', { name: new RegExp(`${user.displayName}.*100,0`) })
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Lisää verenpainemittaus' })).toHaveCount(0)
  } finally {
    await application.sql`UPDATE score_settings SET components = ${application.sql.array(original.components)}`
  }
})
