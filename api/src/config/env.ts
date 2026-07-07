import { z } from "zod";

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

  REDIS_URL: z.string().default("redis://redis:6379"),

  APP_FRONTEND_URL: z.string().url().default("http://localhost:3000"),

  JWT_SECRET: z.string().min(1).default("development-only-jwt-secret"),
  JWT_EXPIRES_IN: z.string().default("7d"),

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

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates environment variables.
 * Exits the process with a clear error message if validation fails.
 */
export function parseEnv(env: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}
