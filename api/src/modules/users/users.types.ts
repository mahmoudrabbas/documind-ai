import type { UserPublicView } from "../auth/auth.types.js";

export interface InviteUserInput {
  name: string;
  email: string;
  role: "COMPANY_ADMIN" | "EMPLOYEE";
}

export interface InviteUserResult {
  user: UserPublicView;
}

export interface UpdateUserInput {
  role?: "COMPANY_ADMIN" | "EMPLOYEE";
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
