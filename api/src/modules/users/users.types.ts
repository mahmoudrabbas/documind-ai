import type { UserPublicView } from "../auth/auth.types.js";

export interface InviteUserInput {
  name: string;
  email: string;
  role: "COMPANY_ADMIN" | "EMPLOYEE";
}

export interface InviteUserResult {
  user: UserPublicView;
}
