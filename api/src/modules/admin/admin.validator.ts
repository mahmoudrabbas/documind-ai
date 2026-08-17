import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import {
  TENANT_INVALID_REASON,
  TENANT_MISSING_REASON,
  VALIDATION_ERROR,
} from "../../common/errors/errorCodes.js";
import type {
  ListTenantsInput,
  TenantLifecycleInput,
  TenantPreviewInput,
  UpdateTenantInput,
} from "./admin.types.js";

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "Field must be a valid identifier");

const listTenantsSchema = z
  .object({
    page: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z.coerce.number().int().positive(),
      )
      .default(1),
    pageSize: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z.coerce.number().int().positive().max(100),
      )
      .default(20),
    status: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z
          .enum([
            "active",
            "trial",
            "pending",
            "pending_verification",
            "suspended",
          ])
          .optional(),
      )
      .optional(),
    plan: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z.enum(["free", "trial", "pro"]).optional(),
      )
      .optional(),
    packageId: objectId.optional(),
    search: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z.string().trim().min(1).max(120).optional(),
      )
      .optional(),
  })
  .strict();

function groupValidationIssues(issues: z.ZodIssue[]): Record<string, string[]> {
  return issues.reduce(
    (acc, issue) => {
      const path = issue.path.join(".");
      if (!acc[path]) {
        acc[path] = [];
      }
      acc[path].push(issue.message);
      return acc;
    },
    {} as Record<string, string[]>,
  );
}

export function validateListTenantsInput(input: unknown): ListTenantsInput {
  const result = listTenantsSchema.safeParse(input);

  if (!result.success) {
    throw new AppError(
      400,
      VALIDATION_ERROR,
      "Validation failed",
      groupValidationIssues(result.error.issues),
    );
  }

  return result.data;
}

const updateTenantBodySchema = z
  .object({
    status: z.enum(["active", "trial", "suspended"]).optional(),
    plan: z.enum(["free", "trial", "pro"]).optional(),
  })
  .strict()
  .refine((data) => data.status !== undefined || data.plan !== undefined, {
    message: "At least one field (status or plan) must be provided for update",
    path: [],
  });

const updateTenantParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid tenant ID format"),
});

export function validateTenantId(params: unknown): string {
  const result = updateTenantParamsSchema.safeParse(params);
  if (!result.success) {
    throw new AppError(
      400,
      VALIDATION_ERROR,
      "Validation failed",
      groupValidationIssues(result.error.issues),
    );
  }
  return result.data.id;
}

export function validateUpdateTenantInput(
  params: unknown,
  body: unknown,
): UpdateTenantInput {
  const paramsResult = updateTenantParamsSchema.safeParse(params);
  if (!paramsResult.success) {
    throw new AppError(
      400,
      VALIDATION_ERROR,
      "Validation failed",
      groupValidationIssues(paramsResult.error.issues),
    );
  }

  const bodyResult = updateTenantBodySchema.safeParse(body);
  if (!bodyResult.success) {
    throw new AppError(
      400,
      VALIDATION_ERROR,
      "Validation failed",
      groupValidationIssues(bodyResult.error.issues),
    );
  }

  return {
    id: paramsResult.data.id,
    ...bodyResult.data,
  };
}

const lifecycleBodySchema = z
  .object({
    reason: z.unknown().optional(),
  })
  .strict();

export function validateLifecycleInput(
  params: unknown,
  body: unknown,
): TenantLifecycleInput {
  const paramsResult = updateTenantParamsSchema.safeParse(params);
  if (!paramsResult.success) {
    throw new AppError(
      400,
      VALIDATION_ERROR,
      "Validation failed",
      groupValidationIssues(paramsResult.error.issues),
    );
  }

  const bodyResult = lifecycleBodySchema.safeParse(body);
  if (!bodyResult.success) {
    throw new AppError(
      400,
      VALIDATION_ERROR,
      "Validation failed",
      groupValidationIssues(bodyResult.error.issues),
    );
  }

  if (
    bodyResult.data.reason === undefined ||
    bodyResult.data.reason === null ||
    (typeof bodyResult.data.reason === "string" &&
      bodyResult.data.reason.trim().length === 0)
  ) {
    throw new AppError(
      400,
      TENANT_MISSING_REASON,
      "Reason is required and cannot be empty or whitespace-only",
    );
  }

  if (typeof bodyResult.data.reason !== "string") {
    throw new AppError(
      400,
      TENANT_INVALID_REASON,
      "Reason must be a string between 3 and 500 characters",
    );
  }

  const trimmedReason = bodyResult.data.reason.trim();
  if (trimmedReason.length < 3 || trimmedReason.length > 500) {
    throw new AppError(
      400,
      TENANT_INVALID_REASON,
      "Reason must be between 3 and 500 characters",
    );
  }

  return {
    id: paramsResult.data.id,
    reason: trimmedReason,
  };
}

export function validatePreviewInput(params: unknown): TenantPreviewInput {
  const paramsResult = updateTenantParamsSchema.safeParse(params);
  if (!paramsResult.success) {
    throw new AppError(
      400,
      VALIDATION_ERROR,
      "Validation failed",
      groupValidationIssues(paramsResult.error.issues),
    );
  }
  return { id: paramsResult.data.id };
}
