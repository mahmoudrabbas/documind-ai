import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("./app.ts", import.meta.url), "utf8");

test("CORS allows Idempotency-Key and preserves the existing allowed headers", () => {
  const allowedHeadersSource = appSource.match(/allowedHeaders:\s*\[([\s\S]*?)\]/)?.[1];

  assert.ok(allowedHeadersSource, "app.ts should define CORS allowedHeaders");
  for (const header of [
    "Content-Type",
    "Authorization",
    "X-Request-ID",
    "X-Correlation-ID",
    "X-Confirm-Logout-All",
    "Idempotency-Key",
  ]) {
    assert.match(allowedHeadersSource, new RegExp(`["']${header}["']`));
  }
});

test("global CORS handles preflight before both document policy apply route groups", () => {
  const corsRegistration = appSource.indexOf("app.use(cors(corsOptions))");
  const documentRoutes = appSource.indexOf('app.use("/documents", documentsRoutes)');
  const processingRoutes = appSource.indexOf('app.use("/documents", processingRoutes)');

  assert.ok(corsRegistration >= 0, "global CORS middleware should be registered");
  assert.ok(documentRoutes > corsRegistration, "CORS should precede the main document routes");
  assert.ok(processingRoutes > corsRegistration, "CORS should precede the processing document routes");
});
