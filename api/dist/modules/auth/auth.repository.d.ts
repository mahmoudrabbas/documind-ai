import type { ClientSession } from "mongoose";
import { type TenantDocument } from "../../db/models/tenant.model.js";
import { type UserDocument } from "../../db/models/user.model.js";
export interface TenantCreateInput {
    name: string;
    slug: string;
    status: string;
    plan: string;
    selectedPackageCode?: string;
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
    customRoleId?: string;
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
export declare function findUserDocumentByTenantAndEmail(tenantId: string, email: string): Promise<any>;
export declare function findSuperAdminByEmail(email: string): Promise<(import("mongoose").Document<unknown, {}, UserDocument, {}, import("mongoose").DefaultSchemaOptions> & UserDocument & Required<{
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
export declare function findUserByTenantAndId(tenantId: string, userId: string): Promise<UserDocument | null>;
export declare function createRefreshTokenRecord(input: {
    tenantId: string;
    userId: string;
    tokenHash: string;
    jtiHash: string;
    familyId: string;
    expiresAt: Date;
    createdByIp?: string;
    userAgent?: string;
}): Promise<any>;
export declare function findRefreshTokenRecord(tenantId: string, tokenHash: string, jtiHash: string): Promise<any>;
export declare function claimRefreshTokenForRotation(tokenId: string, revokedAt: Date): Promise<(import("mongoose").Document<unknown, {}, import("../../db/models/refreshToken.model.js").RefreshTokenDocument, {}, import("mongoose").DefaultSchemaOptions> & import("../../db/models/refreshToken.model.js").RefreshTokenDocument & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}) | null>;
export declare function setRefreshTokenReplacement(tokenId: string, replacementId: string): Promise<import("mongoose").UpdateWriteOpResult>;
export declare function revokeRefreshToken(tokenId: string, revokedAt: Date, revokedByIp?: string): Promise<import("mongoose").UpdateWriteOpResult>;
export declare function markReuseAndRevokeTokenFamily(familyId: string, tenantId: string, userId: string, reusedTokenId: string, revokedAt: Date, revokedByIp?: string): Promise<[import("mongoose").UpdateWriteOpResult, import("mongoose").UpdateWriteOpResult]>;
export declare function revokeRefreshTokenFamily(familyId: string, tenantId: string, userId: string, revokedAt: Date, revokedByIp?: string): Promise<import("mongoose").UpdateWriteOpResult>;
export declare function revokeAllRefreshTokensForTenantUser(userId: string, tenantId: string, revokedAt: Date): Promise<import("mongoose").UpdateWriteOpResult>;
export declare function createTenant(input: TenantCreateInput, session?: ClientSession): Promise<TenantDocument>;
export declare function createUser(input: UserCreateInput, session?: ClientSession): Promise<UserDocument>;
export declare function updateUserVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
export declare function updateUserPasswordResetToken(tenantId: string, userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
export declare function findUserByTenantAndIdWithPasswordResetToken(tenantId: string, userId: string): Promise<(import("mongoose").Document<unknown, {}, UserDocument, {}, import("mongoose").DefaultSchemaOptions> & UserDocument & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}) | null>;
export declare function consumePasswordResetTokenAndUpdatePassword(tenantId: string, userId: string, tokenHash: string, passwordHash: string): Promise<(import("mongoose").Document<unknown, {}, UserDocument, {}, import("mongoose").DefaultSchemaOptions> & UserDocument & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}) | null>;
export declare function activateTenantIfPendingVerification(tenantId: string): Promise<TenantDocument | null>;
export declare function findTenantById(tenantId: string): Promise<TenantDocument | null>;
export declare function deleteTenantById(tenantId: string): Promise<void>;
export declare function deleteUserById(userId: string): Promise<void>;
//# sourceMappingURL=auth.repository.d.ts.map