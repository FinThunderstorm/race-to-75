import { expect, test } from './app-fixtures'
import { failNextRequest, utcDate } from './measurement-helpers'

test('profile sex unlocks SBD, dated weight prefill preserves overrides, and a result persists to DOTS', async ({
  page,
  application,
  signIn
}) => {
  const user = await signIn()
  const measuredAt = utcDate(2)
  // Provider-imported weights are setup; profile and SBD changes go through the actual UI.
  await application.sql`
    INSERT INTO measurement (user_id, weight_kg, measured_at, source)
    VALUES (${user.id}, 100, ${`${utcDate()}T00:00:00Z`}, 'test'),
           (${user.id}, 80, ${`${measuredAt}T00:00:00Z`}, 'test'),
           (${user.id}, 90, ${`${utcDate(-1)}T00:00:00Z`}, 'test')
  `
  await page.goto('/profile?mode=dots#sbd')
  const panel = page.getByRole('region', { name: 'SBD-tulokset' })
  await expect(panel.getByRole('button', { name: 'Lisää tulos', exact: true })).toBeDisabled()
  await expect(panel.getByRole('link', { name: 'Valitse sukupuoli kisaprofiilissa' })).toBeVisible()
  const profile = page.getByRole('region', { name: 'Kisaprofiili' })
  await profile.getByLabel('Sukupuoli').selectOption('female')
  await profile.getByRole('button', { name: 'Tallenna profiili' }).click()
  await expect(profile.getByRole('status')).toHaveText('Profiili tallennettu.')
  await expect(panel.getByLabel('Kehonpaino (kg)')).toHaveValue('100')
  await panel.getByLabel('Tulospäivä (UTC)').fill(utcDate(-1))
  await expect(panel.getByLabel('Kehonpaino (kg)')).toHaveValue('100')
  await panel.getByLabel('Tulospäivä (UTC)').fill(measuredAt)
  await expect(panel.getByLabel('Kehonpaino (kg)')).toHaveValue('80')
  await panel.getByLabel('Kehonpaino (kg)').fill('77')
  await panel.getByLabel('Tulospäivä (UTC)').fill(utcDate(3))
  await expect(panel.getByLabel('Kehonpaino (kg)')).toHaveValue('77')
  await panel.getByLabel('Tulospäivä (UTC)').fill(measuredAt)
  await panel.getByLabel('Kehonpaino (kg)').fill('80')
  await panel.getByLabel('Kyykky (kg)').fill('180')
  await panel.getByLabel('Penkkipunnerrus (kg)').fill('120')
  await panel.getByLabel('Maastaveto (kg)').fill('200')
  await expect(panel.locator('output')).toContainText('500,0 kg')
  await expect(panel.locator('output')).toContainText('471,1 DOTS')
  await expect(panel.locator('output')).toContainText('Elite / National Level')
  await failNextRequest(page, '**/api/sbd-measurements', 'POST')
  await panel.getByRole('button', { name: 'Lisää tulos', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('tallentaminen epäonnistui')
  await expect(panel.getByLabel('Kyykky (kg)')).toHaveValue('180')
  await panel.getByRole('button', { name: 'Lisää tulos', exact: true }).click()
  await expect(panel.getByRole('status')).toHaveText('Tulos lisätty.')
  expect(
    await application.sql`
    SELECT measured_at::text AS date, squat_kg::float AS squat, bench_kg::float AS bench,
      deadlift_kg::float AS deadlift, bodyweight_kg::float AS bodyweight
    FROM sbd_measurement WHERE user_id = ${user.id}
  `
  ).toEqual([{ date: measuredAt, squat: 180, bench: 120, deadlift: 200, bodyweight: 80 }])

  await page.reload()
  await expect(profile.getByLabel('Sukupuoli')).toHaveValue('female')
  await expect(profile.getByLabel('Pituus (cm)')).toHaveValue('')
  await expect(panel.locator('tbody tr')).toHaveCount(1)
  await expect(panel.locator('tbody tr')).toContainText('471,1')
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page).toHaveURL(/mode=dots/)
  await page.getByRole('button', { name: 'Keskeytä näkymien automaattinen vaihto' }).click()
  await expect(
    page.getByRole('button', { name: new RegExp(`${user.displayName}.*471,1`) })
  ).toBeVisible()
  await page.getByText('Näytä mittaukset', { exact: true }).click()
  await expect(page.getByRole('table', { name: 'DOTS-tasorajat' })).toContainText('325')
  await page.getByRole('link', { name: 'Lisää SBD-tulos' }).click()
  await failNextRequest(page, '**/api/sbd-measurements/*', 'DELETE')
  await panel.getByRole('button', { name: /Poista tulos/ }).click()
  await expect(panel.getByRole('alert')).toContainText('poistaminen epäonnistui')
  await expect(panel.locator('tbody tr')).toHaveCount(1)
  await panel.getByRole('button', { name: /Poista tulos/ }).click()
  await expect(panel.getByRole('status')).toHaveText('Tulos poistettu.')
  await page.reload()
  await expect(panel.getByText('Ei vielä SBD-tuloksia.', { exact: true })).toBeVisible()
  expect(await application.sql`SELECT id FROM sbd_measurement WHERE user_id = ${user.id}`).toEqual(
    []
  )
  await page.getByRole('link', { name: 'Takaisin kisaan' }).click()
  await expect(page.locator('.chart-series')).toHaveCount(0)
})
