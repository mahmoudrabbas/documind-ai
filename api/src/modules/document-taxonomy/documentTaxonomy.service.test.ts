import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import type { PermissionValue } from "../permissions/permissions.catalog.js";
import { createDocumentTaxonomyService } from "./documentTaxonomy.service.js";
import type {
  CreateTaxonomyData,
  DocumentTaxonomyRepository,
  TaxonomyKind,
  TaxonomyListQuery,
  TaxonomyOperationContext,
  TaxonomyRecord,
  TaxonomyStatus,
  UpdateTaxonomyData,
} from "./documentTaxonomy.types.js";

const tenantA = "64a000000000000000000001";
const tenantB = "64b000000000000000000001";
const actorA = "64a000000000000000000002";
const actorB = "64b000000000000000000002";
const fixedDate = new Date("2026-07-22T12:00:00.000Z");

test("category lifecycle normalizes names, rejects duplicates, archives, and restores", async () => {
  const repository = new FakeTaxonomyRepository();
  const permissions: PermissionValue[] = [];
  const auditOperations: string[] = [];
  const service = createDocumentTaxonomyService({
    repository,
    authorization: { async authorize(_context, permission) { permissions.push(permission); } },
    audit: async ({ kind, operation }) => { auditOperations.push(`${kind}:${operation}`); },
  });

  const created = await service.create("category", {
    name: "  Human   Resources ",
    description: "Policies",
  }, contextA);
  assert.equal(created.name, "Human Resources");
  assert.equal(created.status, "active");
  assert.equal("normalizedName" in created, false);
  assert.equal("tenantId" in created, false);

  await assert.rejects(
    service.create("category", { name: "HUMAN RESOURCES" }, contextA),
    hasCode("DOCUMENT_CATEGORY_DUPLICATE"),
  );
  const sameNameOtherTenant = await service.create(
    "category",
    { name: "HUMAN RESOURCES" },
    contextB,
  );
  assert.equal(sameNameOtherTenant.name, "HUMAN RESOURCES");
  const updated = await service.update("category", created.id, {
    name: "People Operations",
    version: created.version,
  }, contextA);
  const archived = await service.archive("category", created.id, {
    version: updated.version,
  }, contextA);
  assert.equal(archived.status, "archived");
  assert.deepEqual((await service.list("category", {}, contextA)).records, []);
  assert.equal((await service.list("category", { status: "archived" }, contextA)).records.length, 1);
  await assert.rejects(
    service.archive("category", created.id, { version: archived.version }, contextA),
    hasCode("TAXONOMY_RECORD_ARCHIVED"),
  );
  const restored = await service.restore("category", created.id, {
    version: archived.version,
  }, contextA);
  assert.equal(restored.status, "active");
  assert.ok(permissions.includes("company-settings:read"));
  assert.ok(permissions.includes("company-settings:update"));
  assert.deepEqual(auditOperations, ["category:created", "category:created", "category:updated", "category:archived", "category:restored"]);
});

test("department operations hide cross-tenant records", async () => {
  const repository = new FakeTaxonomyRepository();
  const service = allowAllService(repository);
  const created = await service.create("department", { name: "Finance" }, contextA);
  await assert.rejects(
    service.create("department", { name: "  FINANCE " }, contextA),
    hasCode("DEPARTMENT_DUPLICATE"),
  );

  await assert.rejects(service.get("department", created.id, contextB), hasCode("TAXONOMY_RECORD_NOT_FOUND"));
  await assert.rejects(
    service.update("department", created.id, { name: "Other", version: 1 }, contextB),
    hasCode("TAXONOMY_RECORD_NOT_FOUND"),
  );
  await assert.rejects(
    service.archive("department", created.id, { version: 1 }, contextB),
    hasCode("TAXONOMY_RECORD_NOT_FOUND"),
  );
});

test("classification validates level and preserves it through display-name updates", async () => {
  const repository = new FakeTaxonomyRepository();
  const service = allowAllService(repository);
  const created = await service.create("classification", {
    name: "Board Only",
    level: "highly_confidential",
  }, contextA);
  const updated = await service.update("classification", created.id, {
    name: "Executive Only",
    version: created.version,
  }, contextA);
  assert.equal(updated.level, "highly_confidential");
  const archived = await service.archive("classification", created.id, {
    version: updated.version,
  }, contextA);
  assert.equal(archived.status, "archived");
  assert.deepEqual((await service.list("classification", {}, contextA)).records, []);
  await assert.rejects(
    service.create("classification", { name: "Bad", level: "unknown" }, contextA),
    hasCode("INVALID_CLASSIFICATION_LEVEL"),
  );
});

test("pagination, count, and search remain tenant-scoped", async () => {
  const repository = new FakeTaxonomyRepository();
  const service = allowAllService(repository);
  await service.create("category", { name: "Alpha Policies" }, contextA);
  await service.create("category", { name: "Beta Policies" }, contextA);
  await service.create("category", { name: "Alpha Foreign" }, contextB);

  const firstPage = await service.list("category", {
    page: 1,
    pageSize: 1,
    search: "policies",
  }, contextA);
  assert.equal(firstPage.records.length, 1);
  assert.equal(firstPage.pagination.totalRecords, 2);
  assert.equal(firstPage.pagination.totalPages, 2);
  assert.equal(firstPage.records[0]?.name, "Alpha Policies");
});

test("duplicate database errors map to kind-specific stable errors", async () => {
  const repository = new FakeTaxonomyRepository();
  repository.failNextCreateAsDuplicate = true;
  const service = allowAllService(repository);
  await assert.rejects(
    service.create("department", { name: "Operations" }, contextA),
    hasCode("DEPARTMENT_DUPLICATE"),
  );
});

test("mutation authorization is repeated at the service boundary", async () => {
  const repository = new FakeTaxonomyRepository();
  const service = createDocumentTaxonomyService({
    repository,
    authorization: {
      async authorize(_context, permission) {
        if (permission === "company-settings:update") {
          throw new AppError(403, "PERMISSION_REQUIRED", "Permission denied");
        }
      },
    },
  });
  await assert.rejects(
    service.create("category", { name: "Blocked" }, contextA),
    hasCode("PERMISSION_REQUIRED"),
  );
  assert.equal(repository.records.size, 0);
});

function allowAllService(repository: DocumentTaxonomyRepository) {
  return createDocumentTaxonomyService({
    repository,
    authorization: { async authorize() {} },
  });
}

const contextA: TaxonomyOperationContext = {
  tenantId: tenantA,
  actorId: actorA,
  actorEmail: "admin-a@example.test",
  actorRole: "COMPANY_ADMIN",
};
const contextB: TaxonomyOperationContext = {
  tenantId: tenantB,
  actorId: actorB,
  actorEmail: "admin-b@example.test",
  actorRole: "COMPANY_ADMIN",
};

class FakeTaxonomyRepository implements DocumentTaxonomyRepository {
  readonly records = new Map<string, TaxonomyRecord>();
  failNextCreateAsDuplicate = false;
  private sequence = 16;

  async create(tenantId: string, kind: TaxonomyKind, data: CreateTaxonomyData) {
    if (this.failNextCreateAsDuplicate) {
      this.failNextCreateAsDuplicate = false;
      throw { code: 11000 };
    }
    const id = this.sequence.toString(16).padStart(24, "0");
    this.sequence += 1;
    const record: TaxonomyRecord = {
      id,
      tenantId,
      kind,
      name: data.name,
      normalizedName: data.normalizedName,
      description: data.description,
      status: "active",
      version: 1,
      createdBy: data.createdBy,
      updatedBy: data.updatedBy,
      createdAt: fixedDate,
      updatedAt: fixedDate,
      ...(data.level ? { level: data.level } : {}),
    };
    this.records.set(this.key(tenantId, kind, id), record);
    return record;
  }

  async findByTenantAndId(tenantId: string, kind: TaxonomyKind, id: string) {
    return this.records.get(this.key(tenantId, kind, id)) ?? null;
  }

  async list(tenantId: string, kind: TaxonomyKind, query: TaxonomyListQuery) {
    const matching = [...this.records.values()]
      .filter((record) => record.tenantId === tenantId && record.kind === kind)
      .filter((record) => query.status === "all" || record.status === query.status)
      .filter((record) => !query.search || record.normalizedName.includes(query.search))
      .sort((left, right) => left.normalizedName.localeCompare(right.normalizedName));
    const start = (query.page - 1) * query.pageSize;
    return {
      records: matching.slice(start, start + query.pageSize),
      totalRecords: matching.length,
    };
  }

  async existsByNormalizedName(
    tenantId: string,
    kind: TaxonomyKind,
    normalizedName: string,
    excludeId?: string,
  ) {
    return [...this.records.values()].some((record) =>
      record.tenantId === tenantId &&
      record.kind === kind &&
      record.normalizedName === normalizedName &&
      record.id !== excludeId);
  }

  async update(
    tenantId: string,
    kind: TaxonomyKind,
    id: string,
    data: UpdateTaxonomyData,
  ) {
    const record = await this.findByTenantAndId(tenantId, kind, id);
    if (!record || record.status !== "active" || record.version !== data.expectedVersion) return null;
    const updated: TaxonomyRecord = {
      ...record,
      ...data,
      version: record.version + 1,
      updatedAt: fixedDate,
    };
    delete (updated as Partial<UpdateTaxonomyData>).expectedVersion;
    this.records.set(this.key(tenantId, kind, id), updated);
    return updated;
  }

  async changeStatus(
    tenantId: string,
    kind: TaxonomyKind,
    id: string,
    expectedVersion: number,
    status: TaxonomyStatus,
    updatedBy: string,
  ) {
    const record = await this.findByTenantAndId(tenantId, kind, id);
    if (!record || record.version !== expectedVersion || record.status === status) return null;
    const updated = {
      ...record,
      status,
      updatedBy,
      version: record.version + 1,
      updatedAt: fixedDate,
    };
    this.records.set(this.key(tenantId, kind, id), updated);
    return updated;
  }

  private key(tenantId: string, kind: TaxonomyKind, id: string): string {
    return `${tenantId}:${kind}:${id}`;
  }
}

function hasCode(code: string) {
  return (error: unknown) => error instanceof AppError && error.code === code;
}
