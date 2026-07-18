import TenantModel, {
  type TenantDocument,
} from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import DocumentModel from "../../db/models/document.model.js";
import UsageLogModel from "../../db/models/usageLog.model.js";
import type { Types } from "mongoose";
import {
  LEGACY_PLATFORM_TENANT_SLUGS,
  PLATFORM_TENANT_SLUG,
} from "../../common/auth/platformTenant.js";

const nonPlatformTenantFilter = {
  isSystemTenant: { $ne: true },
  slug: { $nin: [PLATFORM_TENANT_SLUG, ...LEGACY_PLATFORM_TENANT_SLUGS] },
};

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

export async function updateTenantById(
  id: string,
  updateData: Record<string, unknown>,
): Promise<TenantDocument | null> {
  return TenantModel.findOneAndUpdate(
    { _id: id, ...nonPlatformTenantFilter },
    { $set: updateData },
    { returnDocument: "after", runValidators: true },
  )
    .lean<TenantDocument>()
    .exec();
}

export function findTenantById(id: string) {
  return TenantModel.findOne({ _id: id, ...nonPlatformTenantFilter })
    .lean<TenantDocument>()
    .exec();
}

export async function aggregateTenantStats(tenantIds: Types.ObjectId[]) {
  if (tenantIds.length === 0)
    return { users: new Map(), documents: new Map(), questions: new Map() };
  const match = { tenantId: { $in: tenantIds } };
  const group = { $group: { _id: "$tenantId", count: { $sum: 1 } } };
  const [users, documents, questions] = await Promise.all([
    UserModel.aggregate([{ $match: match }, group]),
    DocumentModel.aggregate([{ $match: match }, group]),
    UsageLogModel.aggregate([
      { $match: { ...match, eventType: "QUESTION_ASKED" } },
      group,
    ]),
  ]);
  const toMap = (rows: Array<{ _id: Types.ObjectId; count: number }>) =>
    new Map(rows.map((row) => [row._id.toString(), row.count]));
  return {
    users: toMap(users),
    documents: toMap(documents),
    questions: toMap(questions),
  };
}
