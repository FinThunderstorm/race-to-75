import { z } from 'zod'

const optionalNonEmptyString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional()
)

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(7500),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.url().default('postgres://postgres:postgres@localhost:5432/race_to_75'),
    WITHINGS_CLIENT_ID: optionalNonEmptyString,
    WITHINGS_CLIENT_SECRET: optionalNonEmptyString,
    WITHINGS_API_BASE_URL: z.url().default('https://wbsapi.withings.net')
  })
  .transform((env) => ({
    port: env.PORT,
    host: env.HOST,
    databaseUrl: env.DATABASE_URL,
    withingsClientId: env.WITHINGS_CLIENT_ID,
    withingsClientSecret: env.WITHINGS_CLIENT_SECRET,
    withingsApiBaseUrl: env.WITHINGS_API_BASE_URL
  }))

export type Config = z.infer<typeof envSchema>

export const config: Config = envSchema.parse(process.env)
