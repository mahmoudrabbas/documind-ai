import { createStructuredLogger } from "./structuredLogger.js";

// Redaction is configured at logger creation time in structuredLogger.ts
export const logger = createStructuredLogger("workers");

