import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/modules/billing/**/*.test.ts", 
      "src/modules/checkout/__tests__/checkout.service.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/subscription-provisioning.contract.test.ts",
    ],
  },
});
