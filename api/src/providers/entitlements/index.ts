import type { EntitlementChecker, OcrUsageRecorder } from "../storage/types.js";
import { AppError } from "../../common/errors/AppError.js";
import { OCR_QUOTA_EXCEEDED, ENTITLEMENT_EXCEEDED } from "../../common/errors/errorCodes.js";
import { getOcrUsageCount, createOcrUsageRecord } from "../../modules/processing/processing.repository.js";

const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
const DEFAULT_OCR_PAGE_LIMIT = 10_000;

export class FakeEntitlementChecker implements EntitlementChecker {
  async checkUploadAllowed(_tenantId: string, _fileSize: number): Promise<void> {
    // no-op: always allows uploads
  }

  async checkOcrPageQuota(_tenantId: string, _pageCount: number): Promise<void> {
    // no-op: always allows OCR
  }

  async recordOcrUsage(_tenantId: string, _pageCount: number): Promise<void> {
    // no-op: recording is handled by the usage recorder
  }
}

export class FakeOcrUsageRecorder implements OcrUsageRecorder {
  private usage: Map<string, number> = new Map();

  async record(
    tenantId: string,
    _documentId: string,
    _documentVersion: number,
    pagesProcessed: number,
    _provider: string,
    _providerModel: string,
    _language: string,
    _durationMs: number,
    _costUsd: number,
  ): Promise<void> {
    const current = this.usage.get(tenantId) || 0;
    this.usage.set(tenantId, current + pagesProcessed);
  }

  async getUsageCount(tenantId: string, _startDate: Date, _endDate: Date): Promise<number> {
    return this.usage.get(tenantId) || 0;
  }

  reset(): void {
    this.usage.clear();
  }
}

export class DbEntitlementChecker implements EntitlementChecker {
  async checkUploadAllowed(_tenantId: string, fileSize: number): Promise<void> {
    if (fileSize > MAX_UPLOAD_SIZE_BYTES) {
      throw new AppError(413, ENTITLEMENT_EXCEEDED, `File size exceeds maximum upload limit of ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)}MB`);
    }
  }

  async checkOcrPageQuota(tenantId: string, pageCount: number): Promise<void> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const currentUsage = await getOcrUsageCount(tenantId, startOfMonth, endOfMonth);

    if (currentUsage + pageCount > DEFAULT_OCR_PAGE_LIMIT) {
      const remaining = Math.max(0, DEFAULT_OCR_PAGE_LIMIT - currentUsage);
      throw new AppError(
        429,
        OCR_QUOTA_EXCEEDED,
        `OCR quota exceeded. Used ${currentUsage} of ${DEFAULT_OCR_PAGE_LIMIT} pages this month. Requested ${pageCount}, only ${remaining} remaining.`,
      );
    }
  }

  async recordOcrUsage(_tenantId: string, _pageCount: number): Promise<void> {
    // Usage is recorded via OcrUsageRecorder.record() after each page is processed
  }
}

export class DbOcrUsageRecorder implements OcrUsageRecorder {
  async record(
    tenantId: string,
    documentId: string,
    documentVersion: number,
    pagesProcessed: number,
    provider: string,
    providerModel: string,
    language: string,
    durationMs: number,
    costUsd: number,
  ): Promise<void> {
    await createOcrUsageRecord(
      tenantId,
      documentId,
      documentVersion,
      pagesProcessed,
      provider,
      providerModel,
      language as "ar" | "en" | "ar+en",
      durationMs,
      costUsd,
    );
  }

  async getUsageCount(tenantId: string, startDate: Date, endDate: Date): Promise<number> {
    return getOcrUsageCount(tenantId, startDate, endDate);
  }
}

let entitlementSingleton: EntitlementChecker | null = null;
let usageRecorderSingleton: OcrUsageRecorder | null = null;

export function getEntitlementChecker(): EntitlementChecker {
  if (!entitlementSingleton) {
    const providerType = process.env.ENTITLEMENT_PROVIDER || "fake";
    if (providerType === "db") {
      entitlementSingleton = new DbEntitlementChecker();
    } else {
      entitlementSingleton = new FakeEntitlementChecker();
    }
  }
  return entitlementSingleton;
}

export function getOcrUsageRecorder(): OcrUsageRecorder {
  if (!usageRecorderSingleton) {
    const providerType = process.env.ENTITLEMENT_PROVIDER || "fake";
    if (providerType === "db") {
      usageRecorderSingleton = new DbOcrUsageRecorder();
    } else {
      usageRecorderSingleton = new FakeOcrUsageRecorder();
    }
  }
  return usageRecorderSingleton;
}
