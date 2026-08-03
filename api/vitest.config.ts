import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
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
