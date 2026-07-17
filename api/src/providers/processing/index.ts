import type { ProcessingDispatcher } from "../storage/types.js";
import { createStructuredLogger } from "../../common/utils/structuredLogger.js";

export class StubProcessingDispatcher implements ProcessingDispatcher {
  private events: Array<{ documentId: string; tenantId: string; dispatchedAt: Date }> = [];

  async dispatchDocumentUploaded(documentId: string, tenantId: string): Promise<void> {
    const entry = { documentId, tenantId, dispatchedAt: new Date() };
    this.events.push(entry);
    const log = createStructuredLogger("processing-dispatch");
    log.info(
      { documentId, tenantId },
      "Processing dispatch: document uploaded (stub)",
    );
  }

  getEvents(): Array<{ documentId: string; tenantId: string; dispatchedAt: Date }> {
    return [...this.events];
  }
}
