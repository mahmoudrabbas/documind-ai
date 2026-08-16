import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    fileParallelism: false,
    hookTimeout: 30000,
    include: ["src/modules/documents/documents.test.ts"],
  },
});
