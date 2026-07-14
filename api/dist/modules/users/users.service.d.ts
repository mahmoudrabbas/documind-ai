import type { InviteUserResult, ListUsersResult, UpdateUserResult, SetPasswordFromInviteResult } from "./users.types.js";
export declare function inviteUser(input: unknown, tenantId: string, inviterId: string): Promise<InviteUserResult>;
export declare function updateUser(input: unknown, tenantId: string, targetUserId: string, updater: {
    userId: string;
    email?: string;
    role?: string;
}): Promise<UpdateUserResult>;
export declare function deleteUser(tenantId: string, targetUserId: string, deleter: {
    userId: string;
    email?: string;
    role?: string;
}): Promise<{
    success: boolean;
    message: string;
}>;
export declare function listUsers(input: unknown, tenantId: string): Promise<ListUsersResult>;
export declare function setPasswordFromInvite(input: unknown): Promise<SetPasswordFromInviteResult>;
export declare function getInviteDetails(input: unknown): Promise<{
    companyName: string;
    email: string;
    role: string;
    expiresAt: string;
}>;
//# sourceMappingURL=users.service.d.ts.map