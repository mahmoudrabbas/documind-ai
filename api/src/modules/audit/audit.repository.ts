import AuditLogModel from "../../db/models/auditLog.model.js";
import { tenantScopedCreate } from "../../db/repositories/tenantScopedRepository.js";
import type { AuditLogInput } from "./audit.types.js";

export function createAuditLog(input: AuditLogInput) {
  return tenantScopedCreate(AuditLogModel, input);
}
