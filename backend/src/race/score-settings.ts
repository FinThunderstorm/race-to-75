import { z } from 'zod'

import { sql } from '../database.js'

const scoreComponentKeys = ['bmi', 'biceps', 'blood-pressure', 'dots'] as const
export type ScoreComponent = (typeof scoreComponentKeys)[number]

export const scoreSettingsSchema = z.strictObject({
  components: z
    .array(z.enum(scoreComponentKeys))
    .min(1)
    .max(scoreComponentKeys.length)
    .refine(
      (components) => new Set(components).size === components.length,
      'Components must be unique'
    )
})

export async function loadScoreSettings() {
  const [settings] = await sql<{ components: ScoreComponent[] }[]>`
    SELECT components FROM score_settings WHERE singleton = true
  `
  return scoreSettingsSchema.parse(settings)
}
