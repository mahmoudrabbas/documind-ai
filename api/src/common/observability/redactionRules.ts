export const SENSITIVE_FIELD_NAMES = [
  // Authentication & Session
  "password",
  "passwordHash",
  "authorization",
  "cookie",
  "accessToken",
  "refreshToken",
  "emailVerificationToken",
  "emailVerificationTokenHash",
  "tokenHash",
  "jtiHash",
  "secret",
  "jwt",
  
  // Content
  "emailBody",
  "documentText",
  "documentContent",
  
  // PII
  "ssn",
  "nationalId",
  "dateOfBirth",
  "phoneNumber",
  
  // Payment
  "cardNumber",
  "cvv",
  "expiryDate",
  
  // Credentials
  "apiKey",
  "secretKey",
  "connectionString",
  "mongodbUri",
  "mongoUri",
  "redisUrl",
  "databaseUrl",
  "smtpPassword",
];

export const SENSITIVE_FIELDS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
  ...SENSITIVE_FIELD_NAMES,
  ...SENSITIVE_FIELD_NAMES.map((field) => `*.${field}`),
  ...SENSITIVE_FIELD_NAMES.map((field) => `config.${field}`),
  ...SENSITIVE_FIELD_NAMES.map((field) => `database.${field}`),
  ...SENSITIVE_FIELD_NAMES.map((field) => `mongo.${field}`),
  ...SENSITIVE_FIELD_NAMES.map((field) => `redis.${field}`),
  ...SENSITIVE_FIELD_NAMES.map((field) => `smtp.${field}`),
];

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function redactObject(
  obj: Record<string, unknown>,
  rules: string[] = SENSITIVE_FIELDS,
  replacement = "[Redacted]"
): Record<string, unknown> {
  // Simple deep clone and redact for audit persistence
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELD_NAMES.includes(key) || rules.includes(key)) {
      result[key] = replacement;
    } else if (isObject(value)) {
      result[key] = redactObject(value, rules, replacement);
    } else if (Array.isArray(value)) {
      result[key] = value.map(v => isObject(v) ? redactObject(v, rules, replacement) : v);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}
