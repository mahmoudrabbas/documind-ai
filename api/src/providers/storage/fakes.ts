import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { Readable as ReadableStream } from "node:stream";
import type {
  StorageProvider,
  SecurityScanner,
  EntitlementChecker,
  ProcessingDispatcher,
  ScanResult,
} from "./types.js";

export class InMemoryStorageProvider implements StorageProvider {
  private files = new Map<string, Buffer>();

  async saveFile(buffer: Buffer, originalName: string, tenantId: string): Promise<string> {
    const ext = originalName.includes(".") ? originalName.substring(originalName.lastIndexOf(".")) : "";
    const key = `${tenantId}/${randomUUID()}${ext}`;
    this.files.set(key, Buffer.from(buffer));
    return key;
  }

  async saveFileFromStream(stream: Readable, originalName: string, tenantId: string): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return this.saveFile(Buffer.concat(chunks), originalName, tenantId);
  }

  async deleteFile(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  getFileStream(storageKey: string): Readable {
    const buf = this.files.get(storageKey);
    if (!buf) throw new Error(`File not found: ${storageKey}`);
    return ReadableStream.from(Buffer.from(buf));
  }

  getContentType(originalName: string): string {
    const ext = originalName.substring(originalName.lastIndexOf(".") + 1).toLowerCase();
    const map: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      doc: "application/msword",
      txt: "text/plain",
      md: "text/markdown",
    };
    return map[ext] ?? "application/octet-stream";
  }

  has(key: string): boolean {
    return this.files.has(key);
  }

  clear(): void {
    this.files.clear();
  }
}

export class FakeSecurityScanner implements SecurityScanner {
  async scan(_buffer: Buffer, filename: string): Promise<ScanResult> {
    const lower = filename.toLowerCase();
    if (lower.includes("malicious") || lower.includes("virus")) {
      return { scanner: "fake", result: "infected", details: "Detected by fake scanner" };
    }
    if (lower.includes("scan-error")) {
      return { scanner: "fake", result: "error", details: "Scanner could not process file" };
    }
    return { scanner: "fake", result: "clean" };
  }
}

export class AllowAllEntitlementChecker implements EntitlementChecker {
  async checkUploadAllowed(_tenantId: string, _fileSize: number): Promise<void> {
    // no-op: always allows
  }

  async checkOcrPageQuota(_tenantId: string, _pageCount: number): Promise<void> {
    // no-op: always allows
  }

  async recordOcrUsage(_tenantId: string, _pageCount: number): Promise<void> {
    // no-op
  }
}

export interface DispatchedEvent {
  documentId: string;
  tenantId: string;
  actorId: string;
  documentVersion: number;
  dispatchedAt: Date;
}

export class RecordingProcessingDispatcher implements ProcessingDispatcher {
  public events: DispatchedEvent[] = [];

  async dispatchDocumentUploaded(documentId: string, tenantId: string, actorId: string, documentVersion: number): Promise<void> {
    this.events.push({ documentId, tenantId, actorId, documentVersion, dispatchedAt: new Date() });
  }

  clear(): void {
    this.events = [];
  }
}
