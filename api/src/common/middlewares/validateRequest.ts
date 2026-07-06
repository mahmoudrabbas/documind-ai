import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError.js";

export interface ValidationSchema {
  body?: (req: { body?: unknown }) => Array<{ field: string; issue: string }>;
  query?: (req: { query?: unknown }) => Array<{ field: string; issue: string }>;
  params?: (req: { params?: unknown }) => Array<{ field: string; issue: string }>;
}

export interface ValidateRequestOptions {
  errorCode?: string;
}

export function validateRequest(
  schema: ValidationSchema,
  options: ValidateRequestOptions = {}
): RequestHandler {
  const errorCode = options.errorCode || "VALIDATION_ERROR";

  return (req, _res, next) => {
    const errors: Array<{ field: string; issue: string }> = [];

    if (schema.body) {
      errors.push(...schema.body(req));
    }

    if (schema.query) {
      errors.push(...schema.query(req));
    }

    if (schema.params) {
      errors.push(...schema.params(req));
    }

    if (errors.length > 0) {
      return next(
        new AppError(400, errorCode, "Validation failed", {
          errors,
        })
      );
    }

    next();
  };
}
