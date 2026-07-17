import type { ProcessingDispatcher } from "../storage/types.js";
import { createStructuredLogger } from "../../common/utils/structuredLogger.js";
import { triggerExtraction } from "../../modules/extraction/extraction.service.js";

export class StubProcessingDispatcher implements ProcessingDispatcher {
  private events: Array<{ documentId: string; tenantId: string; actorId: string; documentVersion: number; dispatchedAt: Date }> = [];

  async dispatchDocumentUploaded(documentId: string, tenantId: string, actorId: string, documentVersion: number): Promise<void> {
    const entry = { documentId, tenantId, actorId, documentVersion, dispatchedAt: new Date() };
    this.events.push(entry);
    const log = createStructuredLogger("processing-dispatch");
    log.info(
      { documentId, tenantId, actorId, documentVersion },
      "Processing dispatch: document uploaded (stub)",
    );
  }

  getEvents(): Array<{ documentId: string; tenantId: string; actorId: string; documentVersion: number; dispatchedAt: Date }> {
    return [...this.events];
  }
}

export class RealProcessingDispatcher implements ProcessingDispatcher {
  async dispatchDocumentUploaded(documentId: string, tenantId: string, actorId: string, documentVersion: number): Promise<void> {
    const log = createStructuredLogger("processing-dispatch");
    log.info(
      { documentId, tenantId, actorId, documentVersion },
      "Processing dispatch: triggering extraction job",
    );
    try {
      const result = await triggerExtraction(tenantId, documentId, actorId, documentVersion);
      log.info(
        { documentId, tenantId, actorId, documentVersion, jobId: result.jobId },
        "Processing dispatch: extraction job triggered successfully",
      );
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error(
        { documentId, tenantId, actorId, documentVersion, error: error.message },
        "Processing dispatch: failed to trigger extraction",
      );
    }
  }
}
