import AuditLogModel from "../../db/models/auditLog.model.js";
import { tenantScopedCreate } from "../../db/repositories/tenantScopedRepository.js";
export function createAuditLog(input) {
    return tenantScopedCreate(AuditLogModel, input);
}
//# sourceMappingURL=audit.repository.js.map