import { Env } from "./env.js";
/**
 * Application-wide configuration object.
 * Parsed once at startup from environment variables with Zod validation.
 *
 * Import this singleton anywhere in the API service to access validated config values.
 *
 * @example
 * import { config } from "./config/index.js";
 * const port = config.PORT;
 */
export declare const config: Env;
//# sourceMappingURL=index.d.ts.map