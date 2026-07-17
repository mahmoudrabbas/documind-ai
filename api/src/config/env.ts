import { z } from "zod";
import { getSecretValue } from "../common/utils/secretEnv.js";

/**
 * Zod schema for API service environment variables.
 * Validates and parses all required and optional env vars at startup.
 */
const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    PORT: z
      .string()
      .default("5000")
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().positive().int()),

    HOST: z.string().default("0.0.0.0"),

    MONGODB_URI: z.string().url().default("mongodb://mongodb:27017/docsai"),
    MONGODB_MAX_RETRIES: z.coerce.number().int().min(0).default(5),
    MONGODB_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(1000),
    MONGODB_RETRY_BACKOFF_FACTOR: z.coerce.number().min(1).default(2),
    MONGODB_RETRY_MAX_DELAY_MS: z.coerce.number().int().min(0).default(10000),

    REDIS_URL: z.string().default("redis://redis:6379"),
    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(1)
      .default(15 * 60 * 1000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(100),
    RATE_LIMIT_MESSAGE: z
      .string()
      .default("Too many requests, please try again later."),

    APP_FRONTEND_URL: z.string().url().default("http://localhost:3000"),

    JWT_SECRET: z.string().min(1).default("development-only-jwt-secret"),
    JWT_EXPIRES_IN: z.string().default("15m"),
    JWT_REFRESH_SECRET: z
      .string()
      .min(1)
      .default("development-only-refresh-jwt-secret"),
    JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
    ENABLE_SUPER_ADMIN_BOOTSTRAP: z
      .string()
      .default("false")
      .transform((value) => value.toLowerCase() === "true"),
    SUPER_ADMIN_BOOTSTRAP_KEY: z.string().default(""),

    EMAIL_VERIFICATION_JWT_SECRET: z
      .string()
      .min(1)
      .default("development-only-email-verification-secret"),
    EMAIL_VERIFICATION_JWT_EXPIRES_IN: z.string().default("24h"),
    PASSWORD_RESET_JWT_SECRET: z
      .string()
      .min(1)
      .default("development-only-password-reset-secret"),
    PASSWORD_RESET_JWT_EXPIRES_IN: z.string().default("15m"),
    EMAIL_WEBHOOK_SECRET: z.string().default("development-only-webhook-secret"),
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
    MAX_FILE_SIZE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(50 * 1024 * 1024),
    ALLOWED_MIME_TYPES: z
      .string()
      .default(
        "application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword",
      ),

    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    LOG_PRETTY: z
      .string()
      .default("false")
      .transform((value) => value.toLowerCase() === "true"),
  })
  .superRefine((env, context) => {
    const controlledEnvironment = env.NODE_ENV === "production" || env.NODE_ENV === "test";
    if (controlledEnvironment) {
      const requiredSecrets = [
        ["JWT_SECRET", env.JWT_SECRET],
        ["JWT_REFRESH_SECRET", env.JWT_REFRESH_SECRET],
        ["EMAIL_VERIFICATION_JWT_SECRET", env.EMAIL_VERIFICATION_JWT_SECRET],
        ["PASSWORD_RESET_JWT_SECRET", env.PASSWORD_RESET_JWT_SECRET],
        ["EMAIL_WEBHOOK_SECRET", env.EMAIL_WEBHOOK_SECRET],
      ] as const;
      for (const [key, value] of requiredSecrets) {
        if (value.length < 32 || value.startsWith("development-only-")) {
          context.addIssue({ code: "custom", path: [key], message: "is required and must contain at least 32 characters" });
        }
      }
      if (env.MONGODB_URI === "mongodb://mongodb:27017/docsai")
        context.addIssue({ code: "custom", path: ["MONGODB_URI"], message: "must be explicitly configured" });
      if (env.REDIS_URL === "redis://redis:6379")
        context.addIssue({ code: "custom", path: ["REDIS_URL"], message: "must be explicitly configured" });
      if (/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(env.APP_FRONTEND_URL))
        context.addIssue({ code: "custom", path: ["APP_FRONTEND_URL"], message: "must not use localhost" });
    }
    if (env.SEND_EMAILS) {
      for (const [key, value] of [["SMTP_HOST", env.SMTP_HOST], ["SMTP_USER", env.SMTP_USER], ["SMTP_PASS", env.SMTP_PASS]] as const) {
        if (!value) context.addIssue({ code: "custom", path: [key], message: "is required when email delivery is enabled" });
      }
    }
    if (
      env.ENABLE_SUPER_ADMIN_BOOTSTRAP &&
      env.SUPER_ADMIN_BOOTSTRAP_KEY.length < 32
    ) {
      context.addIssue({
        code: "custom",
        path: ["SUPER_ADMIN_BOOTSTRAP_KEY"],
        message:
          "must contain at least 32 characters when bootstrap is enabled",
      });
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
    JWT_SECRET: getSecretValue("JWT_SECRET", env.JWT_SECRET, env),
    JWT_REFRESH_SECRET: getSecretValue(
      "JWT_REFRESH_SECRET",
      env.JWT_REFRESH_SECRET,
      env,
    ),
    EMAIL_VERIFICATION_JWT_SECRET: getSecretValue(
      "EMAIL_VERIFICATION_JWT_SECRET",
      env.EMAIL_VERIFICATION_JWT_SECRET,
      env,
    ),
    PASSWORD_RESET_JWT_SECRET: getSecretValue(
      "PASSWORD_RESET_JWT_SECRET",
      env.PASSWORD_RESET_JWT_SECRET,
      env,
    ),
    EMAIL_WEBHOOK_SECRET: getSecretValue(
      "EMAIL_WEBHOOK_SECRET",
      env.EMAIL_WEBHOOK_SECRET,
      env,
    ),
    SMTP_PASS: getSecretValue("SMTP_PASS", env.SMTP_PASS, env),
    SUPER_ADMIN_BOOTSTRAP_KEY: getSecretValue(
      "SUPER_ADMIN_BOOTSTRAP_KEY",
      env.SUPER_ADMIN_BOOTSTRAP_KEY,
      env,
    ),
  };

  const result = envSchema.safeParse(normalizedEnv);

  if (!result.success)
    throw new EnvironmentValidationError(result.error.issues.map((issue) => issue.path.join(".") || "environment"));

  return result.data;
}
