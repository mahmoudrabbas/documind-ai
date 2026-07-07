export interface RegisterRequestDto {
  companyName: string;
  companySlug?: string;
  adminName: string;
  email: string;
  password: string;
}

export interface VerifyEmailRequestDto {
  token: string;
}

export interface ResendVerificationEmailRequestDto {
  email: string;
}
