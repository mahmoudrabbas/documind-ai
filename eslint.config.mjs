import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/build/**",
      "**/out/**",
    ],
  },
  {
    rules: {
      "no-console": "warn",
    },
  },
  {
    files: ["scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
);
