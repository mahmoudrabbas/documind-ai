import mongoose from "mongoose";
import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { PRIVILEGE_ESCALATION, UNKNOWN_PERMISSION, VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import { GrantValidationError, normalizeRoleGrants } from "../permissions/permissions.grants.js";
import type { AssignRoleInput, ChangeRoleStatusInput, CloneRoleInput, CreateRoleInput, DeleteRoleInput, MigrateRoleUsersInput, RemoveRoleAssignmentInput, UpdateRoleInput } from "./roles.types.js";

const RESERVED_NAMES = new Set(["super admin", "company admin", "employee"]);
const nameSchema = z.string().trim().min(2).max(50)
  .regex(/^[\p{L}\p{N}\s'&.()-]+$/u, "name contains invalid characters")
  .refine((value) => !RESERVED_NAMES.has(value.toLowerCase().replaceAll("_", " ")), "name is reserved and cannot be used");
const scopesSchema = z.object({
  selfOnly: z.boolean().optional(),
  departmentIds: z.array(z.string().refine((value) => mongoose.isValidObjectId(value), "department ID must be valid")).optional(),
  documentCategories: z.array(z.string().trim().min(1).max(100)).optional(),
  documentClassifications: z.array(z.string().trim().min(1).max(100)).optional(),
}).strict().optional();
const grantsSchema = z.array(z.object({
  permission: z.string().trim().min(1),
  scopes: scopesSchema,
}).strict()).default([]);

const createRoleSchema = z.object({
  name: nameSchema,
  baseRole: z.enum(["COMPANY_ADMIN", "EMPLOYEE"]),
  grants: grantsSchema,
}).strict();
const updateRoleSchema = z.object({
  name: nameSchema.optional(),
  baseRole: z.enum(["COMPANY_ADMIN", "EMPLOYEE"]).optional(),
  grants: grantsSchema.optional(),
  status: z.enum(["active", "archived"]).optional(),
  version: z.number().int().positive(),
}).strict().refine((data) => Object.keys(data).some((key) => key !== "version"), "At least one mutable field must be provided");
const deleteRoleSchema = z.object({ version: z.number().int().positive() }).strict();
const cloneRoleSchema = z.object({ name: nameSchema, version: z.number().int().positive() }).strict();
const changeRoleStatusSchema = z.object({ version: z.number().int().positive() }).strict();
const assignmentSchema = z.object({
  userId: z.string().refine((value) => mongoose.isObjectIdOrHexString(value), "userId must be a valid ObjectId"),
  roleVersion: z.number().int().positive(),
}).strict();
const migrationSchema = z.object({
  destinationRoleId: z.string().refine((value) => mongoose.isObjectIdOrHexString(value), "destinationRoleId must be a valid ObjectId"),
  sourceVersion: z.number().int().positive(),
  destinationVersion: z.number().int().positive(),
}).strict();

function validate<T extends Record<string, unknown>>(schema: z.ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", result.error.issues.map((issue) => ({ field: issue.path.join(".") || "body", message: issue.message })));
  }
  return result.data;
}

function normalizeGrant<T extends { grants?: unknown }>(payload: T): T {
  if (payload.grants === undefined) return payload;
  try {
    return { ...payload, grants: normalizeRoleGrants(payload.grants) };
  } catch (error) {
    if (error instanceof GrantValidationError && error.code === "UNKNOWN_PERMISSION") {
      throw new AppError(400, UNKNOWN_PERMISSION, "Unknown, deprecated, or inactive permission identifier");
    }
    if (error instanceof GrantValidationError && error.code === "PRIVILEGE_ESCALATION") {
      throw new AppError(403, PRIVILEGE_ESCALATION, "Permission is not delegable by tenant administrators");
    }
    throw new AppError(400, VALIDATION_ERROR, "Invalid permission grant", [{ field: "grants", message: error instanceof Error ? error.message : "Invalid grants" }]);
  }
}

export function validateCreateRoleInput(input: unknown): CreateRoleInput {
  const payload = normalizeGrant(validate(createRoleSchema, input));
  return { ...payload, grants: payload.grants ?? [] } as CreateRoleInput;
}
export function validateUpdateRoleInput(input: unknown): UpdateRoleInput {
  return normalizeGrant(validate(updateRoleSchema, input)) as UpdateRoleInput;
}

export function validateDeleteRoleInput(input: unknown): DeleteRoleInput {
  return validate(deleteRoleSchema, input);
}
export function validateCloneRoleInput(input: unknown): CloneRoleInput { return validate(cloneRoleSchema, input); }
export function validateChangeRoleStatusInput(input: unknown): ChangeRoleStatusInput { return validate(changeRoleStatusSchema, input); }
export function validateAssignRoleInput(input: unknown): AssignRoleInput { return validate(assignmentSchema, input); }
export function validateRemoveRoleAssignmentInput(input: unknown): RemoveRoleAssignmentInput { return validate(assignmentSchema, input); }
export function validateMigrateRoleUsersInput(input: unknown): MigrateRoleUsersInput { return validate(migrationSchema, input); }
