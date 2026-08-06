import { Langfuse } from "langfuse";
import { logger } from "../../common/logger/logger.js";

let langfuseInstance: Langfuse | null = null;

/**
 * Returns the Langfuse client singleton, or null if not configured.
 *
 * Reads from process.env instead of the validated `config` object
 * intentionally: this avoids a hard dependency on config/index.ts
 * (which runs parseEnv at import time), keeping the module testable
 * in isolation and safe to import before config is fully initialized.
 * The env vars are still validated by the Zod schema in env.ts.
 */
export function getLangfuse(): Langfuse | null {
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com";

  if (!secretKey || !publicKey) {
    return null;
  }

  if (!langfuseInstance) {
    try {
      langfuseInstance = new Langfuse({
        secretKey,
        publicKey,
        baseUrl,
        flushInterval: 5000,   // flush every 5 seconds (default is very long)
        flushAt: 1,             // also flush immediately when any event is added
      });
      logger.info({ baseUrl }, "Langfuse client initialized");
    } catch (err) {
      logger.warn({ err }, "Failed to initialize Langfuse client");
      return null;
    }
  }

  return langfuseInstance;
}

export async function shutdownLangfuse(): Promise<void> {
  if (langfuseInstance) {
    try {
      await langfuseInstance.shutdownAsync();
      logger.info("Langfuse client shut down");
    } catch (err) {
      logger.warn({ err }, "Error shutting down Langfuse client");
    }
  }
}
