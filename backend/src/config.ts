import { z } from 'zod'

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(7500),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().url().default('postgres://postgres:postgres@localhost:5432/race_to_75')
  })
  .transform((env) => ({
    port: env.PORT,
    host: env.HOST,
    databaseUrl: env.DATABASE_URL
  }))

export type Config = z.infer<typeof envSchema>

export const config: Config = envSchema.parse(process.env)
