import { EntitlementService } from "../../modules/entitlement/entitlement.service.js";
import { MongoEntitlementProvider } from "../../modules/entitlement/adapters/mongo-entitlement-provider.js";
import { MongoQuotaCounter } from "../../modules/entitlement/adapters/mongo-quota-counter.js";
import type { EntitlementChecker } from "../storage/types.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  FILE_SIZE_LIMIT_EXCEEDED,
  STORAGE_LIMIT_EXCEEDED,
  OCR_QUOTA_EXCEEDED,
} from "../../common/errors/errorCodes.js";
import crypto from "node:crypto";

const MB = 1024 * 1024;

/**
 * CompatEntitlementChecker wraps the new EntitlementService to implement the
 * legacy EntitlementChecker interface.
 *
 * @deprecated Use modules/entitlement middleware directly instead.
 */
export class CompatEntitlementChecker implements EntitlementChecker {
  private readonly service: EntitlementService;

  constructor() {
    this.service = new EntitlementService(
      new MongoQuotaCounter(),
      new MongoEntitlementProvider(),
    );
  }

  async checkUploadAllowed(tenantId: string, fileSize: number): Promise<void> {
    const fileSizeMb = fileSize / MB;

    // Check per-file size limit (fileSizeMb dimension)
    const fileSizeLimit = await this.service.getEffectiveLimit(
      tenantId,
      "fileSizeMb",
    );
    if (fileSizeMb > fileSizeLimit) {
      throw new AppError(
        413,
        FILE_SIZE_LIMIT_EXCEEDED,
        `File size ${fileSizeMb.toFixed(1)}MB exceeds the maximum allowed size of ${fileSizeLimit}MB`,
      );
    }

    // Check total storage limit (storageMb dimension)
    const storageResult = await this.service.check(tenantId, "storageMb");
    if (!storageResult.allowed) {
      throw new AppError(
        413,
        STORAGE_LIMIT_EXCEEDED,
        `Storage quota exceeded. Used ${storageResult.current}MB of ${storageResult.limit}MB`,
      );
    }

    // Project whether adding this file would exceed the storage limit
    const projectedStorage = storageResult.current + Math.ceil(fileSizeMb);
    if (projectedStorage > storageResult.limit) {
      throw new AppError(
        413,
        STORAGE_LIMIT_EXCEEDED,
        `Storage quota would be exceeded. Adding ${fileSizeMb.toFixed(1)}MB would bring total to ${projectedStorage}MB (limit: ${storageResult.limit}MB)`,
      );
    }
  }

  async checkOcrPageQuota(
    tenantId: string,
    pageCount: number,
  ): Promise<void> {
    const result = await this.service.check(tenantId, "ocrPagesPerMonth");
    const projected = result.current + pageCount;
    if (projected > result.limit) {
      const remaining = Math.max(0, result.limit - result.current);
      throw new AppError(
        429,
        OCR_QUOTA_EXCEEDED,
        `OCR quota exceeded. Used ${result.current} of ${result.limit} pages this month. Requested ${pageCount}, only ${remaining} remaining.`,
      );
    }
  }

  async recordOcrUsage(tenantId: string, pageCount: number): Promise<void> {
    const idempotencyKey = crypto.randomUUID();
    const result = await this.service.consume(
      tenantId,
      "ocrPagesPerMonth",
      pageCount,
      idempotencyKey,
    );
    if (!result.committed) {
      throw new AppError(
        429,
        OCR_QUOTA_EXCEEDED,
        `Failed to record OCR usage. Used ${result.current} of ${result.limit} pages.`,
      );
    }
  }
}
