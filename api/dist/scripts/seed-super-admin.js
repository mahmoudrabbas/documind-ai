import "dotenv/config";
import { connectDB, disconnectDB } from "../db/connection.js";
import { seedSuperAdmin } from "./seed-super-admin.service.js";
async function main() {
    if (process.env.SEED_SUPER_ADMIN_ENABLED?.toLowerCase() !== "true") {
        throw new Error("Super Admin seed is disabled. Set SEED_SUPER_ADMIN_ENABLED=true explicitly.");
    }
    await connectDB();
    const result = await seedSuperAdmin({
        platformName: process.env.SEED_PLATFORM_TENANT_NAME ?? "",
        platformSlug: process.env.SEED_PLATFORM_TENANT_SLUG ?? "",
        name: process.env.SEED_SUPER_ADMIN_NAME ?? "",
        email: process.env.SEED_SUPER_ADMIN_EMAIL ?? "",
        password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? "",
    });
    console.info(`Super Admin seed completed for ${result.email}; no password was logged.`);
}
main()
    .catch((error) => {
    console.error(error instanceof Error ? error.message : "Super Admin seed failed");
    process.exitCode = 1;
})
    .finally(() => disconnectDB());
//# sourceMappingURL=seed-super-admin.js.map