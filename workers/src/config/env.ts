import { z } from "zod";
import { getSecretValue } from "../secretEnv.js";

/**
 * Parses boolean environment variables safely.
 *
 * Environment variables always arrive as strings, so:
 * SMTP_SECURE=false
 *
 * arrives in Node.js as the string "false", not the boolean false.
 */
const booleanFromEnv = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === "true") {
      return true;
    }

    if (normalizedValue === "false") {
      return false;
    }
  }

  return value;
}, z.boolean());

/**
 * Zod schema for Workers service environment variables.
 * Validates and parses all required and optional env vars at startup.
 */
const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    MONGODB_URI: z
      .string()
      .url()
      .default("mongodb://mongodb:27017/docsai"),

    REDIS_URL: z
      .string()
      .default("redis://redis:6379"),

    LOG_LEVEL: z
      .enum(["debug", "info", "warn", "error"])
      .default("info"),

    WORKER_CONCURRENCY: z
      .string()
      .default("1")
      .transform((value) => Number.parseInt(value, 10))
      .pipe(z.number().positive().int()),

    SMTP_HOST: z.string().optional(),

    SMTP_PORT: z.coerce
      .number()
      .positive()
      .int()
      .default(587),

    SMTP_USER: z.string().optional(),

    SMTP_PASS: z.string().optional(),

    SMTP_FROM: z.string().optional(),

    SMTP_SECURE: booleanFromEnv,

    UPLOAD_DIR: z
      .string()
      .default("../api/uploads"),

    AI_PROVIDER: z.enum(["openai", "groq", "student-bedrock", "fake"]).default("fake"),

    GROQ_API_KEY: z.string().default(""),
    GROQ_CHAT_MODEL: z.string().default("llama-3.3-70b-versatile"),

    JINA_API_KEY: z.string().default(""),
    JINA_EMBEDDING_MODEL: z.string().default("jina-embeddings-v3"),
    JINA_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1024),

    SBG_API_KEY: z.string().default(""),
    SBG_BASE_URL: z.string().url().default("https://apiaccess.iti.net.eg"),
    BEDROCK_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    BEDROCK_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
    BEDROCK_RETRY_DELAY_MS: z.coerce.number().int().positive().default(1000),
    BEDROCK_CHAT_MODELS: z.string().default("anthropic.claude-opus-4-7,anthropic.claude-sonnet-4-6,deepseek.v3.2,openai.gpt-oss-120b"),
    BEDROCK_FAST_CHAT_MODELS: z.string().default("anthropic.claude-sonnet-4-6,deepseek.v3.2"),
    BEDROCK_EMBEDDING_MODELS: z.string().default("amazon.titan-embed-text-v2:0,us.cohere.embed-v4:0"),
    BEDROCK_IMAGE_MODEL: z.string().default("amazon.nova-canvas-v1:0"),
    BEDROCK_AUDIO_MODEL: z.string().default("amazon.nova-sonic-v1:0"),

    OPENAI_API_KEY: z.string().default(""),
    OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
    OPENAI_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "production" || env.NODE_ENV === "test") {
      if (env.MONGODB_URI === "mongodb://mongodb:27017/docsai") {
        context.addIssue({
          code: "custom",
          path: ["MONGODB_URI"],
          message: "must be explicitly configured",
        });
      }

      if (env.REDIS_URL === "redis://redis:6379") {
        context.addIssue({
          code: "custom",
          path: ["REDIS_URL"],
          message: "must be explicitly configured",
        });
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
      if (!env.SBG_BASE_URL || env.SBG_BASE_URL.trim() === "") {
        context.addIssue({
          code: "custom",
          path: ["SBG_BASE_URL"],
          message: "is required when AI_PROVIDER is student-bedrock",
        });
      }
    }

    if (env.AI_PROVIDER === "openai") {
      if (!env.OPENAI_API_KEY || env.OPENAI_API_KEY.trim() === "") {
        context.addIssue({
          code: "custom",
          path: ["OPENAI_API_KEY"],
          message: "is required when AI_PROVIDER is openai",
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
  });

export type Env = z.infer<typeof envSchema>;

export class EnvironmentValidationError extends Error {
  readonly keys: string[];

  constructor(keys: string[]) {
    const uniqueKeys = [...new Set(keys)].sort();

    super(
      `Invalid environment configuration: ${uniqueKeys.join(", ")}`,
    );

    this.name = "EnvironmentValidationError";
    this.keys = uniqueKeys;
  }
}

/**
 * Parses and validates environment variables.
 *
 * Supports Docker secret file variables such as:
 * - MONGODB_URI_FILE
 * - REDIS_URL_FILE
 * - SMTP_PASS_FILE
 *
 * Throws a key-name-only error so startup fails without leaking values.
 */
export function parseEnv(
  env: Record<string, string | undefined>,
): Env {
  const normalizedEnv = {
    ...env,

    MONGODB_URI: getSecretValue(
      "MONGODB_URI",
      env.MONGODB_URI,
      env,
    ),

    REDIS_URL: getSecretValue(
      "REDIS_URL",
      env.REDIS_URL,
      env,
    ),

    SMTP_PASS: getSecretValue(
      "SMTP_PASS",
      env.SMTP_PASS,
      env,
    ),
  };

  const result = envSchema.safeParse(normalizedEnv);

  if (!result.success) {
    throw new EnvironmentValidationError(
      result.error.issues.map(
        (issue) =>
          issue.path.join(".") || "environment",
      ),
    );
  }

  return result.data;
}
