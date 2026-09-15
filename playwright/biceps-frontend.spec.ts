import { expect, test } from './app-fixtures'
import { failNextRequest, utcDate } from './measurement-helpers'

test('profile height and a biceps measurement persist, update the chart, and can be deleted', async ({
  page,
  application,
  signIn
}) => {
  const user = await signIn()
  const measuredAt = utcDate()
  await page.goto('/?mode=biceps')
  await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
  await failNextRequest(page, '**/api/profile', 'GET')
  await page.getByRole('link', { name: 'Lisää hauismittaus' }).click()
  const profile = page.getByRole('region', { name: 'Kisaprofiili' })
  await expect(profile.getByRole('alert')).toContainText('lataaminen epäonnistui')
  await profile.getByRole('button', { name: 'Yritä ladata profiili uudelleen' }).click()
  await profile.getByLabel('Pituus (cm)').fill('180')
  await failNextRequest(page, '**/api/profile', 'PUT')
  await profile.getByRole('button', { name: 'Tallenna profiili' }).click()
  await expect(profile.getByRole('alert')).toContainText('tallentaminen epäonnistui')
  await expect(profile.getByLabel('Pituus (cm)')).toHaveValue('180')
  await profile.getByRole('button', { name: 'Tallenna profiili' }).click()
  await expect(profile.getByRole('status')).toHaveText('Profiili tallennettu.')

  const panel = page.getByRole('region', { name: 'Hauismittaukset' })
  await expect(panel.getByText('Ei vielä mittauksia.', { exact: true })).toBeVisible()
  await panel.getByLabel('Ympärysmitta (cm)').fill('36.5')
  await panel.getByLabel('Mittauspäivä (UTC)').fill(measuredAt)
  await failNextRequest(page, '**/api/biceps-measurements', 'POST')
  await panel.getByRole('button', { name: 'Lisää mittaus', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('tallentaminen epäonnistui')
  await expect(panel.getByLabel('Ympärysmitta (cm)')).toHaveValue('36.5')
  await panel.getByRole('button', { name: 'Lisää mittaus', exact: true }).click()
  await expect(panel.getByRole('status')).toHaveText('Mittaus lisätty.')
  expect(
    await application.sql`
    SELECT circumference_cm::float AS value, measured_at::text AS date
    FROM biceps_measurement WHERE user_id = ${user.id}
  `
  ).toEqual([{ value: 36.5, date: measuredAt }])

  await page.reload()
  await expect(profile.getByLabel('Pituus (cm)')).toHaveValue('180')
  await expect(panel.locator('tbody tr')).toHaveCount(1)
  await expect(panel.locator('tbody tr')).toContainText('36,5')
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page).toHaveURL(/mode=biceps$/)
  await expect(
    page.getByRole('button', { name: new RegExp(`${user.displayName}.*36,5.*20,3 kp`) })
  ).toBeVisible()
  await page.getByText('Näytä mittaukset', { exact: true }).click()
  await expect(page.getByRole('table')).toContainText('senttimetreinä')
  await page.getByRole('link', { name: 'Lisää hauismittaus' }).click()
  await profile.getByLabel('Pituus (cm)').fill('190')
  await profile.getByRole('button', { name: 'Tallenna profiili' }).click()
  await expect(profile.getByRole('status')).toHaveText('Profiili tallennettu.')
  await page.reload()
  await expect(profile.getByLabel('Pituus (cm)')).toHaveValue('190')
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(
    page.getByRole('button', { name: new RegExp(`${user.displayName}.*36,5.*19,2 kp`) })
  ).toBeVisible()

  await page.getByRole('link', { name: 'Lisää hauismittaus' }).click()
  await profile.getByLabel('Pituus (cm)').fill('')
  await profile.getByRole('button', { name: 'Tallenna profiili' }).click()
  await expect(profile.getByRole('status')).toHaveText('Profiili tallennettu.')
  await page.reload()
  await expect(profile.getByLabel('Pituus (cm)')).toHaveValue('')
  expect(await application.sql`SELECT height_cm FROM users WHERE id = ${user.id}`).toEqual([
    { height_cm: null }
  ])
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page.getByRole('link', { name: 'Lisää pituutesi' })).toBeVisible()
  await expect(page.locator('.chart-series')).toHaveCount(0)
  await page.getByRole('link', { name: 'Lisää pituutesi' }).click()
  await profile.getByLabel('Pituus (cm)').fill('180')
  await profile.getByRole('button', { name: 'Tallenna profiili' }).click()
  await expect(profile.getByRole('status')).toHaveText('Profiili tallennettu.')
  await panel.getByRole('button', { name: /Poista mittaus/ }).click()
  await expect(panel.getByRole('status')).toHaveText('Mittaus poistettu.')
  await page.reload()
  await expect(panel.getByText('Ei vielä mittauksia.', { exact: true })).toBeVisible()
  expect(
    await application.sql`SELECT id FROM biceps_measurement WHERE user_id = ${user.id}`
  ).toEqual([])
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page.getByText('Ei vielä hauismittauksia.', { exact: true })).toBeVisible()
})
