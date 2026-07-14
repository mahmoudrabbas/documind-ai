import { Types } from "mongoose";
import type { AuthIdentity } from "../auth/auth.types.js";
export declare function getOverview(): Promise<{
    metrics: {
        companies: number;
        activeCompanies: number;
        users: number;
        documents: number;
        questions: number;
        failedJobs: number;
        storageBytes: number;
        estimatedCost: number;
    };
    recentAudit: (import("../../db/models/auditLog.model.js").AuditLogDocument & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[];
}>;
export declare function listPackages(): Promise<(import("../../db/models/package.model.js").PackageDocument & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
})[]>;
export declare function getPackage(id: string): Promise<import("../../db/models/package.model.js").PackageDocument & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
export declare function createPackage(input: {
    name: string;
    code: string;
    description: string;
    monthlyPrice: number;
    currency: string;
    limits: {
        users: number;
        documents: number;
        questionsPerMonth: number;
        storageMb: number;
    };
}, actor: AuthIdentity): Promise<import("../../db/models/package.model.js").PackageDocument & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
export declare function updatePackage(id: string, input: Record<string, unknown>, actor: AuthIdentity): Promise<import("../../db/models/package.model.js").PackageDocument & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
export declare function listSubscriptions(): Promise<(import("../../db/models/subscription.model.js").SubscriptionDocument & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
})[]>;
export declare function updateSubscription(tenantId: string, input: {
    packageId: string;
    status: string;
    renewsAt?: string | null;
}, actor: AuthIdentity): Promise<import("../../db/models/subscription.model.js").SubscriptionDocument & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
export declare function listPlatformUsers(input: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
}): Promise<{
    users: (import("../../db/models/user.model.js").UserDocument & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[];
    pagination: {
        totalRecords: number;
        totalPages: number;
        page: number;
        pageSize: number;
        search?: string;
        status?: string;
    };
}>;
export declare function getUsage(): Promise<{
    byTenant: any[];
    byDay: any[];
    storage: any;
}>;
export declare function listJobs(input: {
    page: number;
    pageSize: number;
    status?: string;
}): Promise<{
    jobs: (import("../../db/models/document.model.js").DocumentDocument & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[];
    pagination: {
        totalRecords: number;
        totalPages: number;
        page: number;
        pageSize: number;
        status?: string;
    };
}>;
export declare function getSystemHealth(): {
    status: string;
    services: {
        name: string;
        status: string;
    }[];
    checkedAt: string;
};
export declare function listAudit(input: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
}): Promise<{
    logs: (import("../../db/models/auditLog.model.js").AuditLogDocument & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[];
    pagination: {
        totalRecords: number;
        totalPages: number;
        page: number;
        pageSize: number;
        search?: string;
        status?: string;
    };
}>;
export declare function getSetting(key: string): Promise<Record<string, unknown>>;
export declare function updateSetting(key: string, value: Record<string, unknown>, actor: AuthIdentity): Promise<Record<string, unknown>>;
//# sourceMappingURL=platform.service.d.ts.map