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
}

export interface ProcessingDispatcher {
  dispatchDocumentUploaded(documentId: string, tenantId: string): Promise<void>;
}
