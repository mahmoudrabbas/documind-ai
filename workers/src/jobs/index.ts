import { InMemoryJobHandlerRegistry } from "../contracts/handlerRegistry.js";
import type { JobHandlerRegistry } from "../contracts/jobDispatcher.js";
import { sampleJobHandler } from "./sampleJob.js";
import { createEmailSendJobHandler } from "./emailSendJob.js";
import { employeeImportJobHandler } from "./employeeImportJob.js";
import { createDocumentExtractionJobHandler } from "./documentExtractionJob.js";
import { createDocumentOcrJobHandler } from "./documentOcrJob.js";
import { dataRetentionJobHandler } from "./dataRetentionJob.js";
import { createDocumentChunkingJobHandler } from "./documentChunkingJob.js";
import { createDocumentEmbeddingJobHandler } from "./documentEmbeddingJob.js";
import { createDocumentIndexingJobHandler } from "./documentIndexingJob.js";
import { FakeEmailProvider } from "../providers/fakeEmailProvider.js";
import { SmtpEmailProvider } from "../providers/smtpEmailProvider.js";
import { RestDelivery } from "../providers/restDelivery.js";
import { createDocumentPolicyPropagationJobHandler } from "./documentPolicyPropagationJob.js";
import { createNotificationDispatchJobHandler } from "./notificationDispatchJob.js";
import { RawOutboxWriter } from "../providers/rawOutboxWriter.js";

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
  registry.register(employeeImportJobHandler);
  
  const providerType = process.env.EMAIL_PROVIDER || "smtp";
  const emailProvider = providerType === "fake" ? new FakeEmailProvider() : new SmtpEmailProvider();
  registry.register(createEmailSendJobHandler(emailProvider));
  // Outbox trigger writer shared by failure-emitting jobs (T9) — injected at
  // the composition root; the jobs depend only on the OutboxTriggerPort (DIP).
  const outboxWriter = new RawOutboxWriter();
  registry.register(createDocumentExtractionJobHandler(outboxWriter));
  registry.register(createDocumentOcrJobHandler(outboxWriter));
  registry.register(dataRetentionJobHandler);
  registry.register(createDocumentChunkingJobHandler());
  registry.register(createDocumentEmbeddingJobHandler());
  registry.register(createDocumentIndexingJobHandler());
  registry.register(createDocumentPolicyPropagationJobHandler());
  // Adapter chosen at the composition root; the job only depends on the port (DIP).
  registry.register(createNotificationDispatchJobHandler(new RestDelivery()));

  return registry;
}
