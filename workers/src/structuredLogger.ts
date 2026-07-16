import pino, { type DestinationStream, type LoggerOptions } from "pino";

export const SENSITIVE_FIELD_NAMES = [
  // Authentication & Session
  "password", "passwordHash", "authorization", "cookie",
  "accessToken", "refreshToken",
  "emailVerificationToken", "emailVerificationTokenHash",
  "tokenHash", "jtiHash", "secret", "jwt",
  // Content
  "emailBody", "documentText", "documentContent",
  // PII
  "ssn", "nationalId", "dateOfBirth", "phoneNumber",
  // Payment
  "cardNumber", "cvv", "expiryDate",
  // Credentials
  "apiKey", "secretKey", "connectionString",
  "mongodbUri", "mongoUri", "redisUrl", "databaseUrl", "smtpPassword",
];

export const SENSITIVE_FIELDS = [
  "req.headers.authorization", "req.headers.cookie",
  "headers.authorization", "headers.cookie",
  ...SENSITIVE_FIELD_NAMES,
  ...SENSITIVE_FIELD_NAMES.map((field) => `*.${field}`),
  ...SENSITIVE_FIELD_NAMES.map((field) => `config.${field}`),
  ...SENSITIVE_FIELD_NAMES.map((field) => `database.${field}`),
  ...SENSITIVE_FIELD_NAMES.map((field) => `mongo.${field}`),
  ...SENSITIVE_FIELD_NAMES.map((field) => `redis.${field}`),
  ...SENSITIVE_FIELD_NAMES.map((field) => `smtp.${field}`),
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

export function createStructuredLogger(serviceName: string, destination?: DestinationStream) {
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

  return destination ? pino(options, destination) : pino(options, transport);
}
