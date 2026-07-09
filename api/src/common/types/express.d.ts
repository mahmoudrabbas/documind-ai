import type { Logger } from "pino";
import type { AuthIdentity } from "../../modules/auth/auth.types.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log: Logger;
      /**
       * Authenticated user claims decoded from the access token.
       * Populated by the `authenticate` middleware for protected routes.
       */
      auth?: AuthIdentity;
      /**
       * Tenant ID extracted from the verified JWT.
       * Populated by the `tenantScoping` middleware for tenant-scoped routes.
       */
      tenantId?: string;
    }
  }
}

export {};
