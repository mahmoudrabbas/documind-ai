export interface AuditLogInput {
    tenantId: string;
    userId: string;
    resourceType: string;
    resourceId: string;
    action: string;
    actorId: string;
    actorEmail: string;
    actorRole: string;
    changes: Record<string, unknown>;
}
//# sourceMappingURL=audit.types.d.ts.map