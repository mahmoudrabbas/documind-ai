import { Env, parseEnv } from "./env.js";

/**
 * Application-wide configuration object.
 * Parsed once at startup from environment variables with Zod validation.
 *
 * Import this singleton anywhere in the API service to access validated config values.
 *
 * @example
 * import { config } from "./config/index.js";
 * console.log(config.PORT);
 */
export const config: Env = parseEnv(process.env);