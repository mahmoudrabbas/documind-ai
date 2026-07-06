import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import rootConfig from "../eslint.config.mjs";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default [
  ...rootConfig,
  {
    ignores: ["eslint.config.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
      },
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir,
      },
    },
    rules: {
      "no-console": "off",
    },
  },
];
