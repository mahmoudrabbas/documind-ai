import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import DocumentModel from "../../db/models/document.model.js";
import UsageLogModel from "../../db/models/usageLog.model.js";
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
export async function updateTenantById(id, updateData) {
    return TenantModel.findOneAndUpdate({ _id: id, isSystemTenant: { $ne: true }, slug: { $nin: ["documind-ai", "__documind_platform__"] } }, { $set: updateData }, { new: true, runValidators: true })
        .lean()
        .exec();
}
export function findTenantById(id) {
    return TenantModel.findOne({ _id: id, isSystemTenant: { $ne: true }, slug: { $nin: ["documind-ai", "__documind_platform__"] } })
        .lean()
        .exec();
}
export async function aggregateTenantStats(tenantIds) {
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
    const toMap = (rows) => new Map(rows.map((row) => [row._id.toString(), row.count]));
    return {
        users: toMap(users),
        documents: toMap(documents),
        questions: toMap(questions),
    };
}
//# sourceMappingURL=admin.repository.js.map