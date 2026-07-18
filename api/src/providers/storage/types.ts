import type { Readable } from "node:stream";

export interface ScanResult {
  scanner: string;
  result: "clean" | "infected" | "error";
  details?: string;
}

export interface StorageProvider {
  saveFile(buffer: Buffer, originalName: string, tenantId: string): Promise<string>;
  saveFileFromStream(stream: Readable, originalName: string, tenantId: string): Promise<string>;
  deleteFile(storageKey: string): Promise<void>;
  getFileStream(storageKey: string): Readable;
  getContentType(originalName: string): string;
}

export interface SecurityScanner {
  scan(buffer: Buffer, filename: string): Promise<ScanResult>;
}

export interface EntitlementChecker {
  checkUploadAllowed(tenantId: string, fileSize: number): Promise<void>;
  checkOcrPageQuota(tenantId: string, pageCount: number): Promise<void>;
  recordOcrUsage(tenantId: string, pageCount: number): Promise<void>;
}

export interface OcrUsageRecorder {
  record(tenantId: string, documentId: string, documentVersion: number, pagesProcessed: number, provider: string, providerModel: string, language: string, durationMs: number, costUsd: number): Promise<void>;
  getUsageCount(tenantId: string, startDate: Date, endDate: Date): Promise<number>;
}

export interface ProcessingDispatcher {
  dispatchDocumentUploaded(documentId: string, tenantId: string, actorId: string, documentVersion: number): Promise<void>;
}
