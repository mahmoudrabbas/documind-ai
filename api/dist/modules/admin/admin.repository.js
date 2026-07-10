import TenantModel from "../../db/models/tenant.model.js";
export async function countTenantsByFilter(filter) {
    return TenantModel.countDocuments(filter).exec();
}
export async function findTenantsByFilter(filter, page, pageSize) {
    return TenantModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec();
}
//# sourceMappingURL=admin.repository.js.map