import { createStructuredLogger } from "../utils/structuredLogger.js";

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

const baseLogger = createStructuredLogger("api");

export const logger = baseLogger.child({
  redact: {
    paths: sensitiveFields,
    censor: "[Redacted]",
  },
});
