import { z } from "zod";
import { logger } from "../common/logger/logger.js";

/**
 * Zod schema for API service environment variables.
 * Validates and parses all required and optional env vars at startup.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z
    .string()
    .default("5000")
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive().int()),

  HOST: z.string().default("0.0.0.0"),

  MONGODB_URI: z
    .string()
    .url()
    .default("mongodb://mongodb:27017/docsai"),
  MONGODB_MAX_RETRIES: z.coerce.number().int().min(0).default(5),
  MONGODB_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(1000),
  MONGODB_RETRY_BACKOFF_FACTOR: z.coerce.number().min(1).default(2),
  MONGODB_RETRY_MAX_DELAY_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(10000),

  REDIS_URL: z.string().default("redis://redis:6379"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1).default(15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_MESSAGE: z.string().default("Too many requests, please try again later."),

  APP_FRONTEND_URL: z.string().url().default("http://localhost:3000"),

  JWT_SECRET: z.string().min(1).default("development-only-jwt-secret"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(1)
    .default("development-only-refresh-jwt-secret"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  ENABLE_SUPER_ADMIN_BOOTSTRAP: z.string().default("false").transform((value) => value.toLowerCase() === "true"),
  SUPER_ADMIN_BOOTSTRAP_KEY: z.string().default(""),

  EMAIL_VERIFICATION_JWT_SECRET: z
    .string()
    .min(1)
    .default("development-only-email-verification-secret"),
  EMAIL_VERIFICATION_JWT_EXPIRES_IN: z.string().default("24h"),
  SEND_EMAILS: z
    .string()
    .default("false")
    .transform((value) => value.toLowerCase() === "true"),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z
    .string()
    .default("587")
    .transform((value) => parseInt(value, 10))
    .pipe(z.number().positive().int()),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((value) => value.toLowerCase() === "true"),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default("DocuMind AI <no-reply@localhost>"),

  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024),
  ALLOWED_MIME_TYPES: z
    .string()
    .default("application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"),

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  LOG_PRETTY: z
    .string()
    .default("false")
    .transform((value) => value.toLowerCase() === "true"),
}).superRefine((env, context) => {
  if (env.ENABLE_SUPER_ADMIN_BOOTSTRAP && env.SUPER_ADMIN_BOOTSTRAP_KEY.length < 32) {
    context.addIssue({ code: "custom", path: ["SUPER_ADMIN_BOOTSTRAP_KEY"], message: "must contain at least 32 characters when bootstrap is enabled" });
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates environment variables.
 * Exits the process with a clear error message if validation fails.
 */
export function parseEnv(env: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    logger.error(
      {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      "Invalid environment variables"
    );
    process.exit(1);
  }

  return result.data;
}
