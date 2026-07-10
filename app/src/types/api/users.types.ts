export interface UserView {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: "COMPANY_ADMIN" | "EMPLOYEE";
  status: "active" | "pending" | "pending_email_verification" | "disabled";
  emailVerified: boolean;
  createdAt: string;
}

export interface UsersPagination { page: number; pageSize: number; totalPages: number; totalRecords: number }
export interface UsersResponse { success: true; data: { users: UserView[]; pagination: UsersPagination } }
