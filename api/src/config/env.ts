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

    MONGODB_URI: z.string().url(),
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
    RESEND_VERIFICATION_COOLDOWN_MS: z.coerce
      .number()
      .int()
      .min(1)
      .default(60 * 1000),
    RESEND_VERIFICATION_COOLDOWN_MAX_REQUESTS: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),
    RESEND_VERIFICATION_PER_ACCOUNT_HOURLY_MAX_REQUESTS: z.coerce
      .number()
      .int()
      .min(1)
      .default(3),
    RESEND_VERIFICATION_PER_ACCOUNT_DAILY_MAX_REQUESTS: z.coerce
      .number()
      .int()
      .min(1)
      .default(5),
    RESEND_VERIFICATION_PER_IP_HOURLY_MAX_REQUESTS: z.coerce
      .number()
      .int()
      .min(1)
      .default(20),
    RESEND_VERIFICATION_PER_IP_DAILY_MAX_REQUESTS: z.coerce
      .number()
      .int()
      .min(1)
      .default(100),
    RESEND_VERIFICATION_PER_TENANT_DAILY_MAX_REQUESTS: z.coerce
      .number()
      .int()
      .min(1)
      .default(200),
    RESEND_VERIFICATION_IP_DISTINCT_EMAILS_24H_MONITOR_THRESHOLD: z.coerce
      .number()
      .int()
      .min(1)
      .default(20),

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

    // Machine-auth secret for the notification socket server (T15). The T20
    // sweep keys below are reserved here so todo 10 only implements the sweep.
    NOTIFICATION_SOCKET_SERVICE_TOKEN: z
      .string()
      .min(1)
      .default("development-only-notification-socket-token"),
    NOTIFICATION_SWEEP_ENABLED: z
      .string()
      .default("false")
      .transform((value) => value.toLowerCase() === "true"),
    NOTIFICATION_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
    NOTIFICATION_SWEEP_TTL_BATCH: z.coerce.number().int().positive().default(500),
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
    STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
    /**
     * Public base URL of the API service. Used to build absolute URLs for
     * tenant-branding assets (e.g. the uploaded company logo) that are embedded
     * in the app UI and in outgoing email HTML, so they must be reachable by
     * browsers and email clients outside the service network.
     */
    PUBLIC_API_URL: z.string().url().default("http://localhost:5000"),
    AWS_REGION: z.string().default(""),
    AWS_S3_BUCKET: z.string().default(""),
    AWS_ACCESS_KEY_ID: z.string().default(""),
    AWS_SECRET_ACCESS_KEY: z.string().default(""),
    MAX_FILE_SIZE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(50 * 1024 * 1024),
    ALLOWED_MIME_TYPES: z
      .string()
      .default(
        "application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),

    IMPORT_MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
    IMPORT_ALLOWED_MIME_TYPES: z
      .string()
      .default(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv",
      ),

    VISION_MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
    VISION_ALLOWED_MIME_TYPES: z
      .string()
      .default("image/jpeg,image/png,image/webp"),

    LOGO_MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),
    LOGO_ALLOWED_MIME_TYPES: z
      .string()
      .default("image/jpeg,image/png,image/webp,image/gif,image/svg+xml"),

    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    LOG_PRETTY: z
      .string()
      .default("false")
      .transform((value) => value.toLowerCase() === "true"),

    PAYMENT_PROVIDER: z.enum(["fake", "stripe"]).default("fake"),
    STRIPE_SECRET_KEY: z.string().default(""),
    STRIPE_WEBHOOK_SECRET: z.string().default(""),
    STRIPE_PUBLISHABLE_KEY: z.string().default(""),
    STRIPE_SUCCESS_URL: z.string().url().default("http://localhost:3000/checkout/success"),
    STRIPE_CANCEL_URL: z.string().url().default("http://localhost:3000/checkout/cancel"),
    STRIPE_BILLING_PORTAL_RETURN_URL: z.string().url().default("http://localhost:3000/dashboard/settings/billing"),
    STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID: z.string().default(""),
    BILLING_PORTAL_ALLOWED_ORIGIN: z.string().url().default("http://localhost:3000"),
    BILLING_PAST_DUE_GRACE_DAYS: z.coerce.number().int().min(0).max(90).default(7),
    BILLING_GOODWILL_REFUND_CAP_MINOR: z.coerce.number().int().min(0).default(0),

    OPENAI_API_KEY: z.string().default(""),
    OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
    OPENAI_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),

    AI_PROVIDER: z.enum(["openai", "groq", "student-bedrock", "fake"]).default("fake"),

    GROQ_API_KEY: z.string().default(""),
    GROQ_STT_API_KEY: z.string().default(""),
    GROQ_CHAT_MODEL: z.string().default("llama-3.3-70b-versatile"),
    GROQ_VISION_MODEL: z.string().default("qwen/qwen3.6-27b"),

    JINA_API_KEY: z.string().default(""),
    JINA_EMBEDDING_MODEL: z.string().default("jina-embeddings-v3"),
    JINA_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1024),

    SBG_API_KEY: z.string().default(""),
    BEDROCK_GATEWAY_URL: z.string().url().default("http://apiaccess.iti.net.eg"),
    BEDROCK_GATEWAY_API_KEY: z.string().default(""),
    BEDROCK_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    BEDROCK_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
    BEDROCK_RETRY_DELAY_MS: z.coerce.number().int().positive().default(1000),
    BEDROCK_CHAT_MODELS: z.string().default("anthropic.claude-opus-4-7,anthropic.claude-sonnet-4-6,deepseek.v3.2,openai.gpt-oss-120b"),
    BEDROCK_FAST_CHAT_MODELS: z.string().default("anthropic.claude-sonnet-4-6,deepseek.v3.2"),
    BEDROCK_EMBEDDING_MODELS: z.string().default("amazon.titan-embed-text-v2:0,us.cohere.embed-v4:0"),
    BEDROCK_IMAGE_MODEL: z.string().default("amazon.nova-canvas-v1:0"),
    BEDROCK_AUDIO_MODEL: z.string().default("amazon.nova-sonic-v1:0"),

    LANGFUSE_SECRET_KEY: z.string().default(""),
    LANGFUSE_PUBLIC_KEY: z.string().default(""),
    LANGFUSE_BASE_URL: z.string().default("https://cloud.langfuse.com"),
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
        ["NOTIFICATION_SOCKET_SERVICE_TOKEN", env.NOTIFICATION_SOCKET_SERVICE_TOKEN],
      ] as const;
      for (const [key, value] of requiredSecrets) {
        if (value.length < 32 || value.startsWith("development-only-")) {
          context.addIssue({ code: "custom", path: [key], message: "is required and must contain at least 32 characters" });
        }
      }
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
    if (env.PAYMENT_PROVIDER === "stripe") {
      for (const [key, value] of [
        ["STRIPE_SECRET_KEY", env.STRIPE_SECRET_KEY],
        ["STRIPE_WEBHOOK_SECRET", env.STRIPE_WEBHOOK_SECRET],
      ] as const) {
        if (!value) context.addIssue({ code: "custom", path: [key], message: "is required when PAYMENT_PROVIDER is stripe" });
      }
      try {
        if (new URL(env.STRIPE_BILLING_PORTAL_RETURN_URL).origin !== new URL(env.BILLING_PORTAL_ALLOWED_ORIGIN).origin) {
          context.addIssue({ code: "custom", path: ["STRIPE_BILLING_PORTAL_RETURN_URL"], message: "origin is not allowed" });
        }
      } catch {
        context.addIssue({ code: "custom", path: ["BILLING_PORTAL_ALLOWED_ORIGIN"], message: "is invalid" });
      }
    }
    if (env.AI_PROVIDER === "student-bedrock") {
      if (!env.SBG_API_KEY || env.SBG_API_KEY.trim() === "") {
        context.addIssue({
          code: "custom",
          path: ["SBG_API_KEY"],
          message: "is required when AI_PROVIDER is student-bedrock",
        });
      }
    }
    if (env.AI_PROVIDER === "groq") {
      if (!env.GROQ_API_KEY || env.GROQ_API_KEY.trim() === "") {
        context.addIssue({
          code: "custom",
          path: ["GROQ_API_KEY"],
          message: "is required when AI_PROVIDER is groq",
        });
      }
      if (!env.JINA_API_KEY || env.JINA_API_KEY.trim() === "") {
        context.addIssue({
          code: "custom",
          path: ["JINA_API_KEY"],
          message: "is required when AI_PROVIDER is groq (for embeddings)",
        });
      }
    }
    if (env.STORAGE_PROVIDER === "s3") {
      if (!env.AWS_S3_BUCKET || env.AWS_S3_BUCKET.trim() === "") {
        context.addIssue({
          code: "custom",
          path: ["AWS_S3_BUCKET"],
          message: "is required when STORAGE_PROVIDER is s3",
        });
      }
      if (!env.AWS_REGION || env.AWS_REGION.trim() === "") {
        context.addIssue({
          code: "custom",
          path: ["AWS_REGION"],
          message: "is required when STORAGE_PROVIDER is s3",
        });
      }
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
    NOTIFICATION_SOCKET_SERVICE_TOKEN: getSecretValue(
      "NOTIFICATION_SOCKET_SERVICE_TOKEN",
      env.NOTIFICATION_SOCKET_SERVICE_TOKEN,
      env,
    ),
    STRIPE_SECRET_KEY: getSecretValue(
      "STRIPE_SECRET_KEY",
      env.STRIPE_SECRET_KEY,
      env,
    ),
    STRIPE_WEBHOOK_SECRET: getSecretValue(
      "STRIPE_WEBHOOK_SECRET",
      env.STRIPE_WEBHOOK_SECRET,
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
