import { countTenantsByFilter, findTenantsByFilter, } from "./admin.repository.js";
function serializeTenant(tenant) {
    const id = tenant._id?.toString() ?? "";
    return {
        id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan,
        createdAt: tenant.createdAt?.toISOString() ?? new Date().toISOString(),
        updatedAt: tenant.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
}
export async function listTenants(input) {
    const { page, pageSize, status, plan, search } = input;
    // Build filter object
    const filter = {};
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
    // Calculate pagination metadata
    const totalPages = Math.ceil(totalRecords / pageSize);
    return {
        tenants: tenants.map(serializeTenant),
        pagination: {
            page,
            pageSize,
            totalPages,
            totalRecords,
        },
    };
}
//# sourceMappingURL=admin.service.js.map