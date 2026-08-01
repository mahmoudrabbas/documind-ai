import type { HybridRetrievalService } from "../../retrieval/retrieval.service.js";

let retrievalService: HybridRetrievalService | null = null;

export function setCopilotRetrievalService(s: HybridRetrievalService): void {
  retrievalService = s;
}

export function getCopilotRetrievalService(): HybridRetrievalService {
  if (!retrievalService) {
    throw new Error(
      "Copilot retrieval service not initialized. Call setCopilotRetrievalService() before use.",
    );
  }
  return retrievalService;
}
