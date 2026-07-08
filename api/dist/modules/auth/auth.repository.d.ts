import type { ClientSession } from "mongoose";
import { type TenantDocument } from "../../db/models/tenant.model.js";
import { type UserDocument } from "../../db/models/user.model.js";
export interface TenantCreateInput {
    name: string;
    slug: string;
    status: string;
    plan: string;
}
export interface UserCreateInput {
    tenantId: string;
    name: string;
    email: string;
    passwordHash: string;
    role: string;
    status: string;
    emailVerified: boolean;
    emailVerifiedAt: Date | null;
}
export declare function findTenantBySlug(slug: string): Promise<TenantDocument | null>;
export declare function findUserByEmail(email: string): Promise<UserDocument | null>;
export declare function findUserDocumentByEmail(email: string): Promise<(import("mongoose").Document<unknown, {}, UserDocument, {}, import("mongoose").DefaultSchemaOptions> & UserDocument & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}) | null>;
export declare function findUserDocumentByTenantAndEmail(tenantId: string, email: string): Promise<(import("mongoose").Document<unknown, {}, UserDocument, {}, import("mongoose").DefaultSchemaOptions> & UserDocument & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}) | null>;
export declare function findUserDocumentById(userId: string): Promise<(import("mongoose").Document<unknown, {}, UserDocument, {}, import("mongoose").DefaultSchemaOptions> & UserDocument & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}) | null>;
export declare function findUserById(userId: string): Promise<UserDocument | null>;
export declare function createTenant(input: TenantCreateInput, session?: ClientSession): Promise<TenantDocument>;
export declare function createUser(input: UserCreateInput, session?: ClientSession): Promise<UserDocument>;
export declare function updateUserVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
export declare function activateTenantIfPendingVerification(tenantId: string): Promise<TenantDocument | null>;
export declare function findTenantById(tenantId: string): Promise<TenantDocument | null>;
export declare function deleteTenantById(tenantId: string): Promise<void>;
export declare function deleteUserById(userId: string): Promise<void>;
//# sourceMappingURL=auth.repository.d.ts.map