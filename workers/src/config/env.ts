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
}).superRefine((env, context) => {
  if (env.NODE_ENV === "production" || env.NODE_ENV === "test") {
    if (env.MONGODB_URI === "mongodb://mongodb:27017/docsai")
      context.addIssue({ code: "custom", path: ["MONGODB_URI"], message: "must be explicitly configured" });
    if (env.REDIS_URL === "redis://redis:6379")
      context.addIssue({ code: "custom", path: ["REDIS_URL"], message: "must be explicitly configured" });
  }
});

export type Env = z.infer<typeof envSchema>;

export class EnvironmentValidationError extends Error {
  readonly keys: string[];
  constructor(keys: string[]) {
    const uniqueKeys = [...new Set(keys)].sort();
    super(`Invalid environment configuration: ${uniqueKeys.join(", ")}`);
    this.name = "EnvironmentValidationError";
    this.keys = uniqueKeys;
  }
}

/**
 * Parses and validates environment variables.
 * Throws a key-name-only error so startup fails without leaking values.
 */
export function parseEnv(env: Record<string, string | undefined>): Env {
  const normalizedEnv = {
    ...env,
    MONGODB_URI: getSecretValue("MONGODB_URI", env.MONGODB_URI, env),
    REDIS_URL: getSecretValue("REDIS_URL", env.REDIS_URL, env),
  };

  const result = envSchema.safeParse(normalizedEnv);

  if (!result.success)
    throw new EnvironmentValidationError(result.error.issues.map((issue) => issue.path.join(".") || "environment"));

  return result.data;
}
