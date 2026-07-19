import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid identifier");
const action = z.string().trim().min(3).max(80).regex(/^[A-Z][A-Z0-9_]+$/);
const resourceType = z.enum([
  "User", "Role", "Document", "DocumentQuality", "OcrPageResult", "Package",
  "Subscription", "PlatformSetting", "Tenant", "Session", "System", "Permission",
]);
const filters = {
  action: action.optional(),
  actorId: objectId.optional(),
  actorEmail: z.string().trim().toLowerCase().email().max(254).optional(),
  resourceType: resourceType.optional(),
  resourceId: z.string().trim().min(1).max(200).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  outcome: z.enum(["SUCCESS", "FAILURE", "DENIED"]).optional(),
};

const getAuditLogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  ...filters,
}).strict().superRefine(validateDateOrder);

const exportAuditLogsSchema = z.object({
  ...filters,
  dateFrom: z.string().datetime(),
}).strict().superRefine((value, context) => {
  validateDateOrder(value, context);
  const end = value.dateTo ? new Date(value.dateTo) : new Date();
  if (new Date(value.dateFrom).getTime() > end.getTime()) {
    context.addIssue({
      code: "custom",
      path: ["dateFrom"],
      message: "dateFrom cannot be in the future",
    });
  }
  if (end.getTime() - new Date(value.dateFrom).getTime() > 31 * 24 * 60 * 60 * 1000) {
    context.addIssue({
      code: "custom",
      path: ["dateFrom"],
      message: "Export date range cannot exceed 31 days",
    });
  }
});

const auditLogIdSchema = z.object({ id: objectId }).strict();
const platformAuditSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  search: z.string().trim().max(120).optional(),
  status: action.optional(),
}).strict();

export function validateAuditLogsInput(input: unknown) {
  const result = getAuditLogsSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", result.error.issues);
  }
  return result.data;
}

export function validateExportAuditLogsInput(input: unknown) {
  const result = exportAuditLogsSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", result.error.issues);
  }
  return result.data;
}

export function validateAuditLogIdInput(input: unknown): { id: string } {
  const result = auditLogIdSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", result.error.issues);
  }
  return result.data;
}

export function validatePlatformAuditInput(input: unknown) {
  const result = platformAuditSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", result.error.issues);
  }
  return result.data;
}

function validateDateOrder(
  value: { dateFrom?: string; dateTo?: string },
  context: z.RefinementCtx,
): void {
  if (
    value.dateFrom &&
    value.dateTo &&
    new Date(value.dateFrom).getTime() > new Date(value.dateTo).getTime()
  ) {
    context.addIssue({
      code: "custom",
      path: ["dateTo"],
      message: "dateTo must be on or after dateFrom",
    });
  }
}
