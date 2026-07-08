import pino from "pino";

const sensitiveFields = [
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
  "password",
  "passwordHash",
  "accessToken",
  "refreshToken",
  "emailVerificationToken",
  "emailVerificationTokenHash",
  "tokenHash",
  "jtiHash",
  "secret",
  "jwt",
  "cookie",
];

const nodeEnv = process.env.NODE_ENV ?? "development";
const configuredLevel = process.env.LOG_LEVEL ?? "info";
const isTest =
  nodeEnv === "test" || process.env.NODE_TEST_CONTEXT !== undefined;
const level =
  isTest && process.env.LOG_LEVEL === undefined
    ? "silent"
    : configuredLevel;

const transport =
  process.env.LOG_PRETTY?.toLowerCase() === "true" && nodeEnv !== "production"
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
        },
      })
    : undefined;

export const logger = pino(
  {
    level,
    redact: {
      paths: sensitiveFields,
      censor: "[Redacted]",
    },
  },
  transport
);
