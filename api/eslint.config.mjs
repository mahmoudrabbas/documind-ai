import rootConfig from "../eslint.config.mjs";

export default [
  ...rootConfig,
  {
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
];
