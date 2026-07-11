export interface RegisterInput {
  companyName: string;
  companySlug?: string;
  adminName: string;
  email: string;
  password: string;
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
  role: string;
  status: string;
  emailVerified: boolean;
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
  role?: string;
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

export interface AuthIdentity {
  userId: string;
  tenantId: string;
  role?: string;
  email?: string;
}
