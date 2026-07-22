import mongoose from "mongoose";
import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import {
  INVALID_CLASSIFICATION_LEVEL,
  TAXONOMY_VALIDATION_FAILED,
} from "../../common/errors/errorCodes.js";
import { normalizeTaxonomyDisplayName, normalizeTaxonomyName } from "./documentTaxonomy.normalization.js";
import {
  CLASSIFICATION_LEVELS,
  type ClassificationLevel,
  type TaxonomyKind,
  type TaxonomyListQuery,
} from "./documentTaxonomy.types.js";

export interface CreateTaxonomyInput {
  name: string;
  description?: string | null;
  level?: ClassificationLevel;
}

export interface UpdateTaxonomyInput {
  name?: string;
  description?: string | null;
  level?: ClassificationLevel;
  version: number;
}

const nameSchema = z.string().max(100).transform(normalizeTaxonomyDisplayName)
  .refine((value) => normalizeTaxonomyName(value).length > 0, "name must not be blank");
const descriptionSchema = z.string().trim().max(500).nullable().optional();
const baseCreateShape = { name: nameSchema, description: descriptionSchema };
const baseUpdateShape = {
  name: nameSchema.optional(),
  description: descriptionSchema,
  version: z.number().int().positive(),
};
const createSchemas = {
  category: z.object(baseCreateShape).strict(),
  department: z.object(baseCreateShape).strict(),
  classification: z.object({
    ...baseCreateShape,
    level: z.enum(CLASSIFICATION_LEVELS),
  }).strict(),
};
const updateSchemas = {
  category: z.object(baseUpdateShape).strict(),
  department: z.object(baseUpdateShape).strict(),
  classification: z.object({
    ...baseUpdateShape,
    level: z.enum(CLASSIFICATION_LEVELS).optional(),
  }).strict(),
};
const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["active", "archived", "all"]).default("active"),
  search: z.string().trim().max(100).optional(),
}).strict();
const idSchema = z.object({
  id: z.string().refine((value) => mongoose.isObjectIdOrHexString(value), "id must be a valid ObjectId"),
}).strict();
const statusChangeSchema = z.object({ version: z.number().int().positive() }).strict();

export function validateCreateTaxonomyInput(
  kind: TaxonomyKind,
  input: unknown,
): CreateTaxonomyInput {
  return parse(createSchemas[kind], input, kind === "classification") as CreateTaxonomyInput;
}

export function validateUpdateTaxonomyInput(
  kind: TaxonomyKind,
  input: unknown,
): UpdateTaxonomyInput {
  const result = parse(updateSchemas[kind], input, kind === "classification") as UpdateTaxonomyInput;
  if (Object.keys(result).every((key) => key === "version")) {
    throw validationError([{ path: ["body"], message: "At least one mutable field must be provided" }]);
  }
  return result;
}

export function validateTaxonomyListInput(input: unknown): TaxonomyListQuery {
  const result = parse(listSchema, input, false);
  return {
    ...result,
    ...(result.search ? { search: normalizeTaxonomyName(result.search) } : {}),
  };
}

export function validateTaxonomyId(input: unknown): string {
  return parse(idSchema, input, false).id;
}

export function validateTaxonomyStatusChange(input: unknown): { version: number } {
  return parse(statusChangeSchema, input, false);
}

function parse<T>(schema: z.ZodType<T>, input: unknown, classification: boolean): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const invalidLevel = classification && result.error.issues.some((issue) => issue.path[0] === "level");
    if (invalidLevel) {
      throw new AppError(400, INVALID_CLASSIFICATION_LEVEL, "Invalid document classification level");
    }
    throw validationError(result.error.issues);
  }
  return result.data;
}

function validationError(
  issues: readonly { path: PropertyKey[]; message: string }[],
): AppError {
  return new AppError(
    400,
    TAXONOMY_VALIDATION_FAILED,
    "Taxonomy validation failed",
    issues.map((issue) => ({ field: issue.path.join(".") || "body", message: issue.message })),
  );
}
