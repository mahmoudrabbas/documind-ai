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
