import type { UserPublicView } from "../auth/auth.types.js";
export interface InviteUserInput {
    name: string;
    email: string;
    role?: "COMPANY_ADMIN" | "EMPLOYEE";
    customRoleId?: string;
}
export interface InviteUserResult {
    user: UserPublicView;
}
export interface UpdateUserInput {
    role?: "COMPANY_ADMIN" | "EMPLOYEE";
    customRoleId?: string;
    status?: "active" | "pending" | "pending_email_verification" | "disabled";
}
export interface UpdateUserResult {
    user: UserPublicView;
}
export interface ListUsersInput {
    page: number;
    pageSize: number;
}
export interface ListUsersResult {
    users: UserPublicView[];
    pagination: {
        page: number;
        pageSize: number;
        totalPages: number;
        totalRecords: number;
    };
}
export interface SetPasswordFromInviteInput {
    token: string;
    password: string;
}
export interface SetPasswordFromInviteResult {
    user: UserPublicView;
}
//# sourceMappingURL=users.types.d.ts.map