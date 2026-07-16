import assert from "node:assert/strict";
import test from "node:test";
import { redactObject } from "../observability/redactionRules.js";
import { createStructuredLogger } from "./structuredLogger.js";

test("creates a structured logger for the API service", () => {
  const logger = createStructuredLogger("api");

  assert.ok(logger);
});

test("redacts secret-bearing aliases while preserving safe configuration fields", () => {
  const redacted = redactObject({
    mongodbUri: "synthetic-mongodb-marker",
    mongoUri: "synthetic-mongo-marker",
    redisUrl: "synthetic-redis-marker",
    databaseUrl: "synthetic-database-marker",
    smtpPassword: "synthetic-smtp-marker",
    accessToken: "synthetic-access-token-marker",
    headers: { authorization: "synthetic-authorization-marker" },
    config: {
      redisUrl: "synthetic-nested-redis-marker",
      mongodbConfigured: true,
    },
  });

  assert.equal(redacted.mongodbUri, "[Redacted]");
  assert.equal(redacted.mongoUri, "[Redacted]");
  assert.equal(redacted.redisUrl, "[Redacted]");
  assert.equal(redacted.databaseUrl, "[Redacted]");
  assert.equal(redacted.smtpPassword, "[Redacted]");
  assert.equal(redacted.accessToken, "[Redacted]");
  assert.deepEqual(redacted.headers, { authorization: "[Redacted]" });
  assert.deepEqual(redacted.config, {
    redisUrl: "[Redacted]",
    mongodbConfigured: true,
  });
});

test("structured logger redacts configured aliases and nested authorization headers", () => {
  const records: unknown[] = [];
  const logger = createStructuredLogger("api", {
    write(line: string) {
      records.push(JSON.parse(line) as unknown);
    },
  });
  logger.level = "info";

  logger.info(
    {
      mongodbUri: "synthetic-mongodb-marker",
      config: { redisUrl: "synthetic-redis-marker", redisConfigured: true },
      headers: { authorization: "synthetic-authorization-marker" },
      accessToken: "synthetic-access-token-marker",
    },
    "redaction test",
  );

  const record = records[0] as {
    mongodbUri: string;
    config: { redisUrl: string; redisConfigured: boolean };
    headers: { authorization: string };
    accessToken: string;
  };

  assert.equal(record.mongodbUri, "[Redacted]");
  assert.equal(record.config.redisUrl, "[Redacted]");
  assert.equal(record.config.redisConfigured, true);
  assert.equal(record.headers.authorization, "[Redacted]");
  assert.equal(record.accessToken, "[Redacted]");
});
