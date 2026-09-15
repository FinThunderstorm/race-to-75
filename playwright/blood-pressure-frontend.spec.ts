import { expect, test } from './app-fixtures'
import { failNextRequest, utcDate } from './measurement-helpers'

test('blood pressure validates the pair, persists to its two chart series, and retries deletion', async ({
  page,
  application,
  signIn
}) => {
  const user = await signIn()
  const measuredAt = utcDate()
  await page.goto('/?mode=blood-pressure')
  await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
  await expect(page.getByText('Ei vielä verenpainemittauksia.', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Lisää verenpainemittaus' }).click()
  const panel = page.getByRole('region', { name: 'Verenpainemittaukset' })
  await panel.getByLabel('Yläpaine (mmHg)').fill('125')
  await panel.getByLabel('Alapaine (mmHg)').fill('130')
  await panel.getByLabel('Mittauspäivä (UTC)').fill(measuredAt)
  await panel.getByRole('button', { name: 'Lisää mittaus', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText(
    'Yläpaineen on oltava alapaineen yläpuolella'
  )
  expect(
    await application.sql`SELECT id FROM blood_pressure_measurement WHERE user_id = ${user.id}`
  ).toEqual([])
  await panel.getByLabel('Alapaine (mmHg)').fill('82')
  await panel.getByRole('button', { name: 'Lisää mittaus', exact: true }).click()
  await expect(panel.getByRole('status')).toHaveText('Mittaus lisätty.')
  expect(
    await application.sql`
    SELECT systolic, diastolic, measured_at::text AS date
    FROM blood_pressure_measurement WHERE user_id = ${user.id}
  `
  ).toEqual([{ systolic: 125, diastolic: 82, date: measuredAt }])
  await page.reload()
  await expect(panel.locator('tbody tr')).toHaveCount(1)
  await expect(panel.locator('tbody tr')).toContainText('125')
  await expect(panel.locator('tbody tr')).toContainText('82')
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page).toHaveURL(/mode=blood-pressure$/)
  await expect(
    page.getByRole('button', { name: new RegExp(`${user.displayName}.*125,0.*82,0`) })
  ).toBeVisible()
  await expect(page.locator('.diastolic-series')).toHaveCount(1)
  await page.getByText('Näytä mittaukset', { exact: true }).click()
  await expect(page.getByRole('table')).toContainText('mmHg')
  await page.getByRole('link', { name: 'Lisää verenpainemittaus' }).click()
  await failNextRequest(page, '**/api/blood-pressure-measurements/*', 'DELETE')
  await panel.getByRole('button', { name: /Poista mittaus/ }).click()
  await expect(panel.getByRole('alert')).toContainText('poistaminen epäonnistui')
  await expect(panel.locator('tbody tr')).toHaveCount(1)
  await panel.getByRole('button', { name: /Poista mittaus/ }).click()
  await expect(panel.getByRole('status')).toHaveText('Mittaus poistettu.')
  await page.reload()
  await expect(panel.getByText('Ei vielä mittauksia.', { exact: true })).toBeVisible()
  expect(
    await application.sql`SELECT id FROM blood_pressure_measurement WHERE user_id = ${user.id}`
  ).toEqual([])
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page.getByText('Ei vielä verenpainemittauksia.', { exact: true })).toBeVisible()
})
