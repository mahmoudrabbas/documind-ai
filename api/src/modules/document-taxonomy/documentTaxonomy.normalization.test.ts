import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import {
  normalizeTaxonomyDisplayName,
  normalizeTaxonomyName,
} from "./documentTaxonomy.normalization.js";
import {
  validateCreateTaxonomyInput,
  validateTaxonomyListInput,
  validateUpdateTaxonomyInput,
} from "./documentTaxonomy.validator.js";

test("taxonomy name normalization is deterministic without changing display case", () => {
  assert.equal(normalizeTaxonomyDisplayName("  Human   Resources  "), "Human Resources");
  assert.equal(normalizeTaxonomyName("  Human   Resources  "), "human resources");
  assert.equal(normalizeTaxonomyName("HUMAN RESOURCES"), "human resources");
});

test("blank normalized names and tenantId mutation fields reject", () => {
  assert.throws(
    () => validateCreateTaxonomyInput("category", { name: " \t " }),
    (error: unknown) => error instanceof AppError && error.code === "TAXONOMY_VALIDATION_FAILED",
  );
  assert.throws(
    () => validateCreateTaxonomyInput("department", {
      name: "Finance",
      tenantId: "64a000000000000000000001",
    }),
    (error: unknown) => error instanceof AppError && error.code === "TAXONOMY_VALIDATION_FAILED",
  );
  assert.throws(
    () => validateUpdateTaxonomyInput("category", {
      name: "Finance",
      version: 1,
      tenantId: "64a000000000000000000001",
    }),
    (error: unknown) => error instanceof AppError && error.code === "TAXONOMY_VALIDATION_FAILED",
  );
});

test("classification levels and list bounds are validated", () => {
  for (const level of ["internal", "restricted", "confidential", "highly_confidential"] as const) {
    assert.deepEqual(validateCreateTaxonomyInput("classification", {
      name: `Sensitive ${level}`,
      level,
    }), { name: `Sensitive ${level}`, level });
  }
  assert.throws(
    () => validateCreateTaxonomyInput("classification", {
      name: "Unknown",
      level: "top_secret",
    }),
    (error: unknown) => error instanceof AppError && error.code === "INVALID_CLASSIFICATION_LEVEL",
  );
  assert.deepEqual(validateTaxonomyListInput({ search: "  HR   POLICIES " }), {
    page: 1,
    pageSize: 20,
    status: "active",
    search: "hr policies",
  });
});
