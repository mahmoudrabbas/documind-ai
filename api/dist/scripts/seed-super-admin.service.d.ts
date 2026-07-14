export interface SuperAdminSeedInput {
    platformName: string;
    platformSlug: string;
    name: string;
    email: string;
    password: string;
}
export declare function normalizeSeedInput(input: SuperAdminSeedInput): SuperAdminSeedInput;
export declare function seedSuperAdmin(rawInput: SuperAdminSeedInput): Promise<{
    tenantId: string;
    userId: string;
    email: string;
}>;
//# sourceMappingURL=seed-super-admin.service.d.ts.map