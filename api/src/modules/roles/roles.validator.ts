import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import {
  VALID_PERMISSIONS,
} from "../permissions/permissions.catalog.js";
import type {
  CreateRoleInput,
  UpdateRoleInput,
  CloneRoleInput,
} from "./roles.types.js";

const RESERVED_NAMES = new Set([
  "super_admin",
  "company_admin",
  "employee",
]);

const nameSchema = z
  .string()
  .trim()
  .min(2, "name must be at least 2 characters")
  .max(50, "name must be at most 50 characters")
  .regex(
    /^[\p{L}\p{N}\s'&.()-]+$/u,
    "name contains invalid characters",
  )
  .refine((val) => !RESERVED_NAMES.has(val.toLowerCase()), {
    message: "name is reserved and cannot be used",
  });

const permissionsSchema = z
  .array(
    z.string().refine((p) => VALID_PERMISSIONS.has(p), {
      message: "contains unknown permission identifier",
    }),
  )
  .optional();

const scopesSchema = z
  .object({
    selfOnly: z.boolean().optional(),
    departmentIds: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
  })
  .strict()
  .optional();

const createRoleSchema = z
  .object({
    name: nameSchema,
    baseRole: z.enum(["COMPANY_ADMIN", "EMPLOYEE"]),
    permissions: permissionsSchema,
    scopes: scopesSchema,
  })
  .strict();

const updateRoleSchema = z
  .object({
    name: nameSchema.optional(),
    baseRole: z.enum(["COMPANY_ADMIN", "EMPLOYEE"]).optional(),
    permissions: permissionsSchema,
    scopes: scopesSchema,
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message:
        "At least one field must be provided for update",
    },
  );

const cloneRoleSchema = z
  .object({
    name: nameSchema,
  })
  .strict();

function validate<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    const issues = result.error.issues;
    const groupedErrors = new Map<string, string[]>();

    for (const issue of issues) {
      const field = issue.path.join(".") || "query";
      if (!groupedErrors.has(field)) {
        groupedErrors.set(field, []);
      }
      groupedErrors.get(field)?.push(issue.message);
    }

    const details = Array.from(groupedErrors.entries()).map(
      ([field, messages]) => ({
        field,
        message: messages.join(" and "),
      }),
    );

    throw new AppError(
      400,
      VALIDATION_ERROR,
      "Validation failed",
      details,
    );
  }

  return result.data;
}

export function validateCreateRoleInput(
  input: unknown,
): CreateRoleInput {
  return validate(createRoleSchema, input);
}

export function validateUpdateRoleInput(
  input: unknown,
): UpdateRoleInput {
  return validate(updateRoleSchema, input);
}

export function validateCloneRoleInput(
  input: unknown,
): CloneRoleInput {
  return validate(cloneRoleSchema, input);
}
