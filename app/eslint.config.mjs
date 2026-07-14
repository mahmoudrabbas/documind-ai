import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import rootConfig from "../eslint.config.mjs";

const eslintConfig = defineConfig([
  ...rootConfig,
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // These effects synchronize URL-backed drafts and abortable remote requests.
      "react-hooks/set-state-in-effect": "off",
      // Material Symbols is a stylesheet icon dependency, not the primary text font.
      "@next/next/no-page-custom-font": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
