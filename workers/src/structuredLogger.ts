import pino, { type LoggerOptions } from "pino";

const SENSITIVE_FIELDS = [
  // Authentication & Session
  "req.headers.authorization", "req.headers.cookie",
  "headers.authorization", "headers.cookie",
  "password", "passwordHash", "accessToken", "refreshToken",
  "emailVerificationToken", "emailVerificationTokenHash",
  "tokenHash", "jtiHash", "secret", "jwt", "cookie",
  // Content
  "emailBody", "documentText", "documentContent",
  // PII
  "ssn", "nationalId", "dateOfBirth", "phoneNumber",
  // Payment
  "cardNumber", "cvv", "expiryDate",
  // Credentials
  "apiKey", "secretKey", "connectionString",
];

const nodeEnv = process.env.NODE_ENV ?? "development";
const configuredLevel = process.env.LOG_LEVEL ?? "info";
const isTest =
  nodeEnv === "test" || process.env.NODE_TEST_CONTEXT !== undefined;
const level =
  isTest && process.env.LOG_LEVEL === undefined ? "silent" : configuredLevel;

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

export function createStructuredLogger(serviceName: string) {
  const options: LoggerOptions = {
    level,
    base: { service: serviceName },
    timestamp: pino.stdTimeFunctions.isoTime,
    messageKey: "message",
    redact: {
      paths: [...SENSITIVE_FIELDS],
      censor: "[Redacted]",
    },
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
  };

  return pino(options, transport);
}

