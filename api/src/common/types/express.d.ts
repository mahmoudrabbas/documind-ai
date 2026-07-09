import type { Logger } from "pino";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log: Logger;
      /**
       * Authenticated user claims decoded from the access token.
       * Populated by the `authenticate` middleware for protected routes.
       */
      auth?: {
        userId: string;
        tenantId: string;
        role?: string;
        email?: string;
      };
    }
  }
}

export {};
