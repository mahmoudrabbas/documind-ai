import TenantModel, {
  type TenantDocument,
} from "../../db/models/tenant.model.js";

export async function countTenantsByFilter(filter: Record<string, unknown>) {
  return TenantModel.countDocuments(filter).exec();
}

export async function findTenantsByFilter(
  filter: Record<string, unknown>,
  page: number,
  pageSize: number,
) {
  return TenantModel.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean<TenantDocument[]>()
    .exec();
}
