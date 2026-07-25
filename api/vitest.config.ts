import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: [
      "src/modules/billing/**/*.test.ts",
      "src/modules/checkout/__tests__/checkout.service.test.ts",
      "src/modules/auth/__tests__/*.test.ts",
      "src/db/__tests__/*.test.ts",
      "src/scripts/__tests__/*.test.ts",
      "src/modules/imports/__tests__/*.test.ts",
      "src/modules/imports/ports/__tests__/*.test.ts",
      "src/modules/imports/services/__tests__/*.test.ts",
      "src/providers/embedding/__tests__/*.test.ts",
      "src/providers/bedrock/__tests__/*.test.ts",
      "src/providers/vector-index/__tests__/*.test.ts",
      "src/providers/keyword-index/__tests__/*.test.ts",
      "src/modules/processing/chunking/__tests__/*.test.ts",
      "src/modules/processing/indexing/__tests__/*.test.ts",
      "src/modules/retrieval/ports/__tests__/*.test.ts",
      "src/__tests__/*.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/subscription-provisioning.contract.test.ts",
      "**/indexing/__tests__/indexing.tenant-isolation.test.ts",
    ],
  },
});
