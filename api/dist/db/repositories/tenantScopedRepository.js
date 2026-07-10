import { AppError } from "../../common/errors/AppError.js";
import { BAD_REQUEST } from "../../common/errors/errorCodes.js";
function validateTenantId(tenantId) {
    if (typeof tenantId !== "string") {
        throw new AppError(400, BAD_REQUEST, "tenantId is required and must be a non-empty string");
    }
    const normalizedTenantId = tenantId.trim();
    if (!normalizedTenantId) {
        throw new AppError(400, BAD_REQUEST, "tenantId is required and must be a non-empty string");
    }
    return normalizedTenantId;
}
function tenantScopedFilter(tenantId, filter) {
    return {
        ...(filter ?? {}),
        tenantId,
    };
}
export function tenantScopedFindOne(model, tenantId, filter) {
    return model.findOne(tenantScopedFilter(validateTenantId(tenantId), filter));
}
export function tenantScopedFind(model, tenantId, filter) {
    return model.find(tenantScopedFilter(validateTenantId(tenantId), filter));
}
export function tenantScopedFindById(model, tenantId, id) {
    return model.findOne({ _id: id, tenantId: validateTenantId(tenantId) });
}
export function tenantScopedUpdateOne(model, tenantId, filter, update, options) {
    return model.updateOne(tenantScopedFilter(validateTenantId(tenantId), filter), update, options);
}
export function tenantScopedDeleteOne(model, tenantId, filter) {
    return model.deleteOne(tenantScopedFilter(validateTenantId(tenantId), filter));
}
export function tenantScopedCreate(model, document) {
    validateTenantId(document.tenantId);
    return model.create(document);
}
export { validateTenantId as requireTenantId };
//# sourceMappingURL=tenantScopedRepository.js.map