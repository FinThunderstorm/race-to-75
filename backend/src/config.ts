import { z } from "zod";

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(7200),
    HOST: z.string().default("0.0.0.0"),
  })
  .transform((env) => ({
    port: env.PORT,
    host: env.HOST,
  }));

export type Config = z.infer<typeof envSchema>;

export const config: Config = envSchema.parse(process.env);
