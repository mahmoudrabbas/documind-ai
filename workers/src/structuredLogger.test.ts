import assert from "node:assert/strict";
import test from "node:test";
import { createStructuredLogger } from "./structuredLogger.js";

test("worker structured logger redacts secret aliases and preserves safe flags", () => {
  const records: unknown[] = [];
  const logger = createStructuredLogger("workers", {
    write(line: string) {
      records.push(JSON.parse(line) as unknown);
    },
  });
  logger.level = "info";

  logger.info(
    {
      mongodbUri: "synthetic-mongodb-marker",
      mongoUri: "synthetic-mongo-marker",
      redisUrl: "synthetic-redis-marker",
      databaseUrl: "synthetic-database-marker",
      smtpPassword: "synthetic-smtp-marker",
      config: { redisUrl: "synthetic-nested-redis-marker", redisConfigured: true },
      headers: { authorization: "synthetic-authorization-marker" },
      accessToken: "synthetic-access-token-marker",
    },
    "redaction test",
  );

  const record = records[0] as {
    mongodbUri: string;
    mongoUri: string;
    redisUrl: string;
    databaseUrl: string;
    smtpPassword: string;
    config: { redisUrl: string; redisConfigured: boolean };
    headers: { authorization: string };
    accessToken: string;
  };

  assert.equal(record.mongodbUri, "[Redacted]");
  assert.equal(record.mongoUri, "[Redacted]");
  assert.equal(record.redisUrl, "[Redacted]");
  assert.equal(record.databaseUrl, "[Redacted]");
  assert.equal(record.smtpPassword, "[Redacted]");
  assert.equal(record.config.redisUrl, "[Redacted]");
  assert.equal(record.config.redisConfigured, true);
  assert.equal(record.headers.authorization, "[Redacted]");
  assert.equal(record.accessToken, "[Redacted]");
});
