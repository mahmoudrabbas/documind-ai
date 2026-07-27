export interface VectorSearchInput {
  tenantId: string;
  generationId: string;
  vector: number[];
  topK: number;
  filters?: VectorSearchFilters;
}

export interface VectorSearchFilters {
  documentId?: string;
  department?: string;
  classification?: string;
  language?: string;
  contentType?: string;
}

export interface VectorSearchResult {
  chunkId: string;
  documentId: string;
  generationId: string;
  similarityScore: number;
  text: string;
  sectionPath: string[];
  pageStart: number;
  pageEnd: number;
  contentType: string;
  language: string;
}

export interface VectorIndex {
  readonly indexName: string;

  search(input: VectorSearchInput): Promise<VectorSearchResult[]>;
  ensureIndex(dimensions: number): Promise<void>;
  getIndexStatus(): Promise<{ exists: boolean; status: string }>;
}
