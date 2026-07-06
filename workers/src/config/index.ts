import { Env, parseEnv } from "./env.js";

/**
 * Application-wide configuration object for the Workers service.
 * Parsed once at startup from environment variables with Zod validation.
 */
export const config: Env = parseEnv(process.env);
