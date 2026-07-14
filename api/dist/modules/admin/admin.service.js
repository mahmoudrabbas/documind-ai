import { countTenantsByFilter, findTenantsByFilter, findTenantById, aggregateTenantStats, updateTenantById, } from "./admin.repository.js";
import { AppError } from "../../common/errors/AppError.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
function serializeTenant(tenant, stats = { users: 0, documents: 0, questions: 0 }) {
    const id = tenant._id?.toString() ?? "";
    return {
        id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan,
        createdAt: tenant.createdAt?.toISOString() ?? new Date().toISOString(),
        updatedAt: tenant.updatedAt?.toISOString() ?? new Date().toISOString(),
        stats,
    };
}
export async function listTenants(input) {
    const { page, pageSize, status, plan, search } = input;
    // Build filter object
    const filter = {
        isSystemTenant: { $ne: true },
        slug: { $nin: ["documind-ai", "__documind_platform__"] },
    };
    if (status) {
        filter.status = status;
    }
    if (plan) {
        filter.plan = plan;
    }
    if (search) {
        // Support search by name or slug using case-insensitive regex
        filter.$or = [
            { name: { $regex: search, $options: "i" } },
            { slug: { $regex: search, $options: "i" } },
        ];
    }
    // Get total count for pagination
    const totalRecords = await countTenantsByFilter(filter);
    // Fetch paginated results
    const tenants = await findTenantsByFilter(filter, page, pageSize);
    const counts = await aggregateTenantStats(tenants.map((tenant) => tenant._id));
    // Calculate pagination metadata
    const totalPages = Math.ceil(totalRecords / pageSize);
    return {
        tenants: tenants.map((tenant) => {
            const id = tenant._id.toString();
            return serializeTenant(tenant, {
                users: counts.users.get(id) ?? 0,
                documents: counts.documents.get(id) ?? 0,
                questions: counts.questions.get(id) ?? 0,
            });
        }),
        pagination: {
            page,
            pageSize,
            totalPages,
            totalRecords,
        },
    };
}
export async function getTenant(id) {
    const tenant = await findTenantById(id);
    if (!tenant)
        throw new AppError(404, "NOT_FOUND", "Tenant not found");
    const counts = await aggregateTenantStats([tenant._id]);
    return serializeTenant(tenant, {
        users: counts.users.get(id) ?? 0,
        documents: counts.documents.get(id) ?? 0,
        questions: counts.questions.get(id) ?? 0,
    });
}
export async function updateTenant(input, actor) {
    const { id, ...updateData } = input;
    const updatedTenant = await updateTenantById(id, updateData);
    if (!updatedTenant) {
        throw new AppError(404, "NOT_FOUND", "Tenant not found");
    }
    if (actor) {
        await AuditLogModel.create({
            tenantId: updatedTenant._id,
            userId: actor.userId,
            resourceType: "tenant",
            resourceId: id,
            action: "TENANT_UPDATED",
            actorId: actor.userId,
            actorEmail: actor.email,
            actorRole: actor.role,
            changes: updateData,
        });
    }
    const counts = await aggregateTenantStats([updatedTenant._id]);
    return serializeTenant(updatedTenant, {
        users: counts.users.get(id) ?? 0,
        documents: counts.documents.get(id) ?? 0,
        questions: counts.questions.get(id) ?? 0,
    });
}
//# sourceMappingURL=admin.service.js.map