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
    WITHINGS_API_BASE_URL: z.url().default('https://wbsapi.withings.net'),
    WITHINGS_AUTHORIZE_URL: z.url().default('https://account.withings.com/oauth2_user/authorize2'),
    WITHINGS_REDIRECT_URI: optionalNonEmptyString,
    WITHINGS_WEBHOOK_CALLBACK_URL: optionalNonEmptyString,
    WITHINGS_CONNECT_TOKEN: optionalNonEmptyString,
    WITHINGS_BOOTSTRAP_EMAIL: optionalNonEmptyString,
    WITHINGS_BOOTSTRAP_DISPLAY_NAME: optionalNonEmptyString,
    WITHINGS_BOOTSTRAP_ROLE: z.enum(['admin', 'member']).default('admin'),
    WITHINGS_INITIAL_SYNC_DAYS: z.coerce.number().int().positive().default(3650),
    WITHINGS_WORKER_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60)
  })
  .transform((env) => ({
    port: env.PORT,
    host: env.HOST,
    databaseUrl: env.DATABASE_URL,
    withingsClientId: env.WITHINGS_CLIENT_ID,
    withingsClientSecret: env.WITHINGS_CLIENT_SECRET,
    withingsApiBaseUrl: env.WITHINGS_API_BASE_URL,
    withingsAuthorizeUrl: env.WITHINGS_AUTHORIZE_URL,
    withingsRedirectUri: env.WITHINGS_REDIRECT_URI,
    withingsWebhookCallbackUrl: env.WITHINGS_WEBHOOK_CALLBACK_URL,
    withingsConnectToken: env.WITHINGS_CONNECT_TOKEN,
    withingsBootstrapEmail: env.WITHINGS_BOOTSTRAP_EMAIL,
    withingsBootstrapDisplayName: env.WITHINGS_BOOTSTRAP_DISPLAY_NAME,
    withingsBootstrapRole: env.WITHINGS_BOOTSTRAP_ROLE,
    withingsInitialSyncDays: env.WITHINGS_INITIAL_SYNC_DAYS,
    withingsWorkerIntervalSeconds: env.WITHINGS_WORKER_INTERVAL_SECONDS
  }))

export type Config = z.infer<typeof envSchema>

export const config: Config = envSchema.parse(process.env)
