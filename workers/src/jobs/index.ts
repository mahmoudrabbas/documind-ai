import { InMemoryJobHandlerRegistry } from "../contracts/handlerRegistry.js";
import type { JobHandlerRegistry } from "../contracts/jobDispatcher.js";
import { sampleJobHandler } from "./sampleJob.js";
import { createEmailSendJobHandler } from "./emailSendJob.js";
import { createDocumentExtractionJobHandler } from "./documentExtractionJob.js";
import { createDocumentOcrJobHandler } from "./documentOcrJob.js";
import { dataRetentionJobHandler } from "./dataRetentionJob.js";
import { FakeEmailProvider } from "../providers/fakeEmailProvider.js";
import { SmtpEmailProvider } from "../providers/smtpEmailProvider.js";

/**
 * Assembles the worker's handler registry.
 *
 * Product issues register their OWN typed jobs here (against the JobDispatcher
 * port) before the real worker consumer merges — satisfying the parallel-safety
 * contract. This module intentionally contains NO product-specific processors.
 */
export function buildHandlerRegistry(): JobHandlerRegistry {
  const registry = new InMemoryJobHandlerRegistry();
  registry.register(sampleJobHandler);
  
  const providerType = process.env.EMAIL_PROVIDER || "smtp";
  const emailProvider = providerType === "fake" ? new FakeEmailProvider() : new SmtpEmailProvider();
  registry.register(createEmailSendJobHandler(emailProvider));
  registry.register(createDocumentExtractionJobHandler());
  registry.register(createDocumentOcrJobHandler());
  registry.register(dataRetentionJobHandler);
  
  return registry;
}
