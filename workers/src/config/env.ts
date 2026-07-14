import { z } from "zod";
import { getSecretValue } from "../secretEnv.js";

/**
 * Zod schema for Workers service environment variables.
 * Validates and parses all required and optional env vars at startup.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  MONGODB_URI: z.string().url().default("mongodb://mongodb:27017/docsai"),

  REDIS_URL: z.string().default("redis://redis:6379"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  WORKER_CONCURRENCY: z
    .string()
    .default("1")
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive().int()),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates environment variables.
 * Exits the process with a clear error message if validation fails.
 */
export function parseEnv(env: Record<string, string | undefined>): Env {
  const normalizedEnv = {
    ...env,
    MONGODB_URI: getSecretValue("MONGODB_URI", env.MONGODB_URI),
    REDIS_URL: getSecretValue("REDIS_URL", env.REDIS_URL),
  };

  const result = envSchema.safeParse(normalizedEnv);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}
