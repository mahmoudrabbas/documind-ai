import type { BaseRole } from "../../common/auth/baseRoles.js";

export interface RegisterInput {
  companyName: string;
  companySlug?: string;
  adminName: string;
  email: string;
  password: string;
  packageCode?: string;
}

export interface VerifyEmailInput {
  token: string;
}

export interface ResendVerificationEmailInput {
  email: string;
}

export interface ForgotPasswordInput {
  email: string;
  slug: string;
}

export interface ResetPasswordInput {
  token: string;
  slug: string;
  password: string;
  confirmPassword: string;
}

export interface ForgotPasswordResult {
  success: boolean;
  message: string;
}

export interface ResetPasswordResult {
  success: boolean;
  message: string;
}

export interface LoginInput {
  companySlug: string;
  email: string;
  password: string;
}
export interface SuperAdminLoginInput { email: string; password: string }

export interface TenantPublicView {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  createdAt: string;
}

export interface UserPublicView {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role?: BaseRole;
  customRoleId?: string;
  customRoleName?: string;
  status: string;
  emailVerified: boolean;
  employeeProfile?: {
    employeeId?: string;
    department?: string;
    jobTitle?: string;
    phone?: string;
    hireDate?: string;
    managerId?: string;
    preferredLanguage?: string;
  };
  createdAt: string;
}

export interface RegisterResult {
  tenant: TenantPublicView;
  user: UserPublicView;
}

export interface VerifyEmailResult {
  user: Omit<UserPublicView, "createdAt">;
  tenant: {
    id: string;
    status: string;
  };
}

export interface LoginResult {
  user: Omit<UserPublicView, "createdAt">;
  tenant: Omit<TenantPublicView, "createdAt">;
  tokens: {
    accessToken: string;
    refreshToken: string;
    tokenType: "Bearer";
    expiresIn: string;
  };
}

export interface AuthTokenClaims {
  [key: string]: unknown;
  sub: string;
  tenantId: string;
  type: "access" | "refresh";
  role?: BaseRole;
  email?: string;
  jti?: string;
  familyId?: string;
}

export interface RefreshTokenContext {
  ip?: string;
  userAgent?: string;
}

export interface RefreshResult {
  tokens: {
    accessToken: string;
    tokenType: "Bearer";
    expiresIn: string;
  };
}

export interface RefreshRotationResult extends RefreshResult {
  refreshToken: string;
}

export interface MeResult {
  user: Omit<UserPublicView, "createdAt">;
  tenant: Omit<TenantPublicView, "createdAt">;
}

export interface CompleteTrialResult {
  success: boolean;
  subscription: {
    id: string;
    packageId: string;
    packageName: string;
    status: string;
    startedAt: string;
  };
}

export interface AuthIdentity {
  userId: string;
  tenantId: string;
  role?: BaseRole;
  email?: string;
}
