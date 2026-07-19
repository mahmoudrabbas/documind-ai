import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: [
      "src/modules/billing/**/*.test.ts",
      "src/modules/checkout/__tests__/checkout.service.test.ts",
      "src/modules/auth/__tests__/*.test.ts",
      "src/modules/imports/__tests__/*.test.ts",
      "src/modules/imports/ports/__tests__/*.test.ts",
      "src/modules/imports/services/__tests__/*.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/subscription-provisioning.contract.test.ts",
    ],
  },
});
