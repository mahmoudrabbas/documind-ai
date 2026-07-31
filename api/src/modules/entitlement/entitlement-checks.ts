import { randomUUID } from "node:crypto";
import { AppError } from "../../common/errors/AppError.js";
import {
  FILE_SIZE_LIMIT_EXCEEDED,
  OCR_QUOTA_EXCEEDED,
  STORAGE_LIMIT_EXCEEDED,
} from "../../common/errors/errorCodes.js";
import { getEntitlementService } from "./entitlement.service.js";

const MB = 1024 * 1024;

/**
 * Verify a tenant may upload a file of the given size.
 *
 * Enforces the per-file size limit (fileSizeMb dimension) and the total
 * storage limit (storageMb dimension), projecting the storage usage that
 * adding the file would produce.
 *
 * @throws AppError 413 FILE_SIZE_LIMIT_EXCEEDED / STORAGE_LIMIT_EXCEEDED
 * @throws AppError 503 ENTITLEMENT_UNAVAILABLE when no snapshot exists
 */
export async function checkUploadAllowed(
  tenantId: string,
  fileSize: number,
): Promise<void> {
  const fileSizeMb = fileSize / MB;
  const service = getEntitlementService();

  // Check per-file size limit (fileSizeMb dimension)
  const fileSizeLimit = await service.getEffectiveLimit(tenantId, "fileSizeMb");
  if (fileSizeMb > fileSizeLimit) {
    throw new AppError(
      413,
      FILE_SIZE_LIMIT_EXCEEDED,
      `File size ${fileSizeMb.toFixed(1)}MB exceeds the maximum allowed size of ${fileSizeLimit}MB`,
    );
  }

  // Check total storage limit (storageMb dimension)
  const storageResult = await service.check(tenantId, "storageMb");
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

/**
 * Verify a tenant may OCR the requested number of pages this period.
 *
 * @throws AppError 429 OCR_QUOTA_EXCEEDED when the projected usage exceeds
 *                   the monthly ocrPagesPerMonth limit
 */
export async function checkOcrPageQuota(
  tenantId: string,
  pageCount: number,
): Promise<void> {
  const service = getEntitlementService();
  const result = await service.check(tenantId, "ocrPagesPerMonth");
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

/**
 * Record OCR page usage for the tenant's current period (idempotent).
 *
 * @throws AppError 429 OCR_QUOTA_EXCEEDED when the usage could not be committed
 */
export async function recordOcrUsage(
  tenantId: string,
  pageCount: number,
): Promise<void> {
  const idempotencyKey = randomUUID();
  const service = getEntitlementService();
  const result = await service.consume(
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
