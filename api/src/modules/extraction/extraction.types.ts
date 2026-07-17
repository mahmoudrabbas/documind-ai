export interface ExtractionStatusView {
  documentId: string;
  tenantId: string;
  documentVersion: number;
  status: "pending" | "extracting" | "completed" | "failed";
  pagesCount: number;
  charactersCount: number;
  warnings: string[];
  hasImageOnlyPages: boolean;
  failureReason: string | null;
  failureCode: string | null;
  durationMs: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}
