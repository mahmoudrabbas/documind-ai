export type TriggeredBy = "INITIAL" | "REINDEX" | "ACCESS_POLICY_CHANGE" | "MODEL_UPGRADE";

export interface StartIndexInput {
  triggeredBy: TriggeredBy;
  chunkingConfig?: {
    targetTokens?: number;
    hardCeiling?: number;
    overlap?: number;
  };
  department?: string | null;
  classification?: string | null;
}

export interface IndexStatusView {
  generationId: string;
  documentId: string;
  documentVersion: number;
  generationNumber: number;
  status: string;
  expectedChunkCount: number;
  actualChunkCount: number;
  expectedEmbeddingCount: number;
  actualEmbeddingCount: number;
  atlasIndexName: string;
  atlasIndexStatus: string;
  triggeredBy: string;
  failureReason: { stage: string; code: string; message: string } | null;
  activatedAt: string | null;
  createdAt: string;
}

export interface SearchStatusView {
  searchStatus: string;
  activeChunkGeneration: string | null;
  latestGeneration: IndexStatusView | null;
}
