import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";

const getAuditLogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().optional(),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  outcome: z.enum(["SUCCESS", "FAILURE", "DENIED"]).optional(),
  tenantId: z.string().optional(),
});

const exportAuditLogsSchema = z.object({
  action: z.string().optional(),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  outcome: z.enum(["SUCCESS", "FAILURE", "DENIED"]).optional(),
  tenantId: z.string().optional(),
});

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
