import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    // API modules import src/config (parseEnv at module load), which validates
    // against NODE_ENV=test and requires a URL MONGODB_URI plus non-default
    // secrets. Mirrors the test env base used by api/src/config/env.test.ts.
    env: {
      NODE_ENV: "test",
      PAYMENT_PROVIDER: "fake",
      MONGODB_URI: "mongodb://127.0.0.1:27017/documind-test",
      REDIS_URL: "redis://127.0.0.1:6379/1",
      APP_FRONTEND_URL: "https://app.test.invalid",
      JWT_SECRET: "vitest-only-jwt-secret-0123456789abcdef",
      JWT_REFRESH_SECRET: "vitest-only-refresh-secret-0123456789abcdef",
      EMAIL_VERIFICATION_JWT_SECRET: "vitest-only-email-verification-secret-0123",
      PASSWORD_RESET_JWT_SECRET: "vitest-only-password-reset-secret-012345",
      EMAIL_WEBHOOK_SECRET: "vitest-only-email-webhook-secret-01234567",
      NOTIFICATION_SOCKET_SERVICE_TOKEN: "vitest-only-notification-socket-token-0123",
    },
    // The official API runner provisions one disposable replica-set database.
    // Persistence suites reset shared collections, so files must not run in
    // parallel against that single database.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
    include: [
      "src/modules/billing/**/*.test.ts",
      "src/modules/checkout/__tests__/checkout.service.test.ts",
      "src/modules/checkout/__tests__/checkout-session-sync.service.test.ts",
      "src/modules/reconciliation/__tests__/provider-reconciliation.service.test.ts",
      "src/modules/auth/__tests__/*.test.ts",
      "src/db/__tests__/*.test.ts",
      "src/db/models/billing-models.test.ts",
      "src/scripts/__tests__/*.test.ts",
      "src/modules/imports/__tests__/*.test.ts",
      "src/modules/imports/ports/__tests__/*.test.ts",
      "src/modules/imports/services/__tests__/*.test.ts",
      "src/modules/chat/chat.stream.controller.test.ts",
      "src/__tests__/*.test.ts",
      "src/modules/agents/__tests__/*.test.ts",
      "src/modules/entitlement/__tests__/*.test.ts",
      "src/modules/entitlement/ports/fakes/__tests__/*.test.ts",
      "src/modules/processing/chunking/__tests__/*.test.ts",
      "src/modules/processing/indexing/__tests__/*.test.ts",
      "src/modules/processing-progress/__tests__/*.test.ts",
      "src/modules/notifications/__tests__/*.test.ts",
      "src/modules/retrieval/ports/__tests__/*.test.ts",
      "src/providers/bedrock/__tests__/*.test.ts",
      "src/providers/embedding/__tests__/*.test.ts",
      "src/providers/keyword-index/__tests__/*.test.ts",
      "src/providers/vector-index/__tests__/*.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/subscription-provisioning.contract.test.ts",
      "**/indexing/__tests__/indexing.tenant-isolation.test.ts",
    ],
  },
});
