import { z } from "zod";
/**
 * Zod schema for API service environment variables.
 * Validates and parses all required and optional env vars at startup.
 */
declare const envSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<{
        development: "development";
        test: "test";
        production: "production";
    }>>;
    PORT: z.ZodPipe<z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<number, string>>, z.ZodNumber>;
    HOST: z.ZodDefault<z.ZodString>;
    MONGODB_URI: z.ZodDefault<z.ZodString>;
    MONGODB_MAX_RETRIES: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    MONGODB_RETRY_DELAY_MS: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    MONGODB_RETRY_BACKOFF_FACTOR: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    MONGODB_RETRY_MAX_DELAY_MS: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    REDIS_URL: z.ZodDefault<z.ZodString>;
    RATE_LIMIT_WINDOW_MS: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    RATE_LIMIT_MAX_REQUESTS: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    RATE_LIMIT_MESSAGE: z.ZodDefault<z.ZodString>;
    APP_FRONTEND_URL: z.ZodDefault<z.ZodString>;
    JWT_SECRET: z.ZodDefault<z.ZodString>;
    JWT_EXPIRES_IN: z.ZodDefault<z.ZodString>;
    JWT_REFRESH_SECRET: z.ZodDefault<z.ZodString>;
    JWT_REFRESH_EXPIRES_IN: z.ZodDefault<z.ZodString>;
    ENABLE_SUPER_ADMIN_BOOTSTRAP: z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<boolean, string>>;
    SUPER_ADMIN_BOOTSTRAP_KEY: z.ZodDefault<z.ZodString>;
    EMAIL_VERIFICATION_JWT_SECRET: z.ZodDefault<z.ZodString>;
    EMAIL_VERIFICATION_JWT_EXPIRES_IN: z.ZodDefault<z.ZodString>;
    PASSWORD_RESET_JWT_SECRET: z.ZodDefault<z.ZodString>;
    PASSWORD_RESET_JWT_EXPIRES_IN: z.ZodDefault<z.ZodString>;
    SEND_EMAILS: z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<boolean, string>>;
    SMTP_HOST: z.ZodDefault<z.ZodString>;
    SMTP_PORT: z.ZodPipe<z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<number, string>>, z.ZodNumber>;
    SMTP_SECURE: z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<boolean, string>>;
    SMTP_USER: z.ZodDefault<z.ZodString>;
    SMTP_PASS: z.ZodDefault<z.ZodString>;
    SMTP_FROM: z.ZodDefault<z.ZodString>;
    UPLOAD_DIR: z.ZodDefault<z.ZodString>;
    MAX_FILE_SIZE_BYTES: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    ALLOWED_MIME_TYPES: z.ZodDefault<z.ZodString>;
    LOG_LEVEL: z.ZodDefault<z.ZodEnum<{
        info: "info";
        error: "error";
        warn: "warn";
        debug: "debug";
    }>>;
    LOG_PRETTY: z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<boolean, string>>;
}, z.core.$strip>;
export type Env = z.infer<typeof envSchema>;
/**
 * Parses and validates environment variables.
 * Exits the process with a clear error message if validation fails.
 */
export declare function parseEnv(env: Record<string, string | undefined>): Env;
export {};
//# sourceMappingURL=env.d.ts.map