import mongoose, { type Model } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { MALFORMED_OBJECT_ID } from "../../common/errors/errorCodes.js";
import DocumentCategoryModel from "../../db/models/documentCategory.model.js";
import DocumentClassificationModel from "../../db/models/documentClassification.model.js";
import DepartmentModel from "../../db/models/department.model.js";
import type {
  ClassificationLevel,
  CreateTaxonomyData,
  DocumentTaxonomyRepository,
  TaxonomyKind,
  TaxonomyListQuery,
  TaxonomyListResult,
  TaxonomyRecord,
  TaxonomyStatus,
  UpdateTaxonomyData,
} from "./documentTaxonomy.types.js";

interface TaxonomyMongoDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  normalizedName: string;
  description: string | null;
  status: TaxonomyStatus;
  version: number;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  level?: ClassificationLevel;
}

export class MongoDocumentTaxonomyRepository implements DocumentTaxonomyRepository {
  async create(
    tenantId: string,
    kind: TaxonomyKind,
    data: CreateTaxonomyData,
  ): Promise<TaxonomyRecord> {
    assertObjectId(tenantId);
    const created = await modelFor(kind).create({
      tenantId,
      ...data,
      status: "active",
      version: 1,
    });
    return toRecord(kind, created.toObject());
  }

  async findByTenantAndId(
    tenantId: string,
    kind: TaxonomyKind,
    id: string,
  ): Promise<TaxonomyRecord | null> {
    assertObjectId(tenantId);
    assertObjectId(id);
    const record = await modelFor(kind).findOne({ _id: id, tenantId }).lean().exec();
    return record ? toRecord(kind, record) : null;
  }

  async list(
    tenantId: string,
    kind: TaxonomyKind,
    query: TaxonomyListQuery,
  ): Promise<TaxonomyListResult> {
    assertObjectId(tenantId);
    const filter: Record<string, unknown> = {
      tenantId,
      ...(query.status === "all" ? {} : { status: query.status }),
    };
    if (query.search) {
      filter.normalizedName = {
        $regex: escapeRegex(query.search),
        $options: "i",
      };
    }
    const model = modelFor(kind);
    const [records, totalRecords] = await Promise.all([
      model.find(filter)
        .sort({ normalizedName: 1, _id: 1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean()
        .exec(),
      model.countDocuments(filter).exec(),
    ]);
    return { records: records.map((record) => toRecord(kind, record)), totalRecords };
  }

  async existsByNormalizedName(
    tenantId: string,
    kind: TaxonomyKind,
    normalizedName: string,
    excludeId?: string,
  ): Promise<boolean> {
    assertObjectId(tenantId);
    if (excludeId) assertObjectId(excludeId);
    return Boolean(await modelFor(kind).exists({
      tenantId,
      normalizedName,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }));
  }

  async update(
    tenantId: string,
    kind: TaxonomyKind,
    id: string,
    data: UpdateTaxonomyData,
  ): Promise<TaxonomyRecord | null> {
    assertObjectId(tenantId);
    assertObjectId(id);
    const { expectedVersion, ...changes } = data;
    const updated = await modelFor(kind).findOneAndUpdate(
      { _id: id, tenantId, status: "active", version: expectedVersion },
      { $set: changes, $inc: { version: 1 } },
      { new: true, runValidators: true },
    ).lean().exec();
    return updated ? toRecord(kind, updated) : null;
  }

  async changeStatus(
    tenantId: string,
    kind: TaxonomyKind,
    id: string,
    expectedVersion: number,
    status: TaxonomyStatus,
    updatedBy: string,
  ): Promise<TaxonomyRecord | null> {
    assertObjectId(tenantId);
    assertObjectId(id);
    assertObjectId(updatedBy);
    const updated = await modelFor(kind).findOneAndUpdate(
      {
        _id: id,
        tenantId,
        status: status === "active" ? "archived" : "active",
        version: expectedVersion,
      },
      { $set: { status, updatedBy }, $inc: { version: 1 } },
      { new: true, runValidators: true },
    ).lean().exec();
    return updated ? toRecord(kind, updated) : null;
  }
}

function modelFor(kind: TaxonomyKind): Model<TaxonomyMongoDocument> {
  switch (kind) {
    case "category":
      return DocumentCategoryModel as unknown as Model<TaxonomyMongoDocument>;
    case "department":
      return DepartmentModel as unknown as Model<TaxonomyMongoDocument>;
    case "classification":
      return DocumentClassificationModel as unknown as Model<TaxonomyMongoDocument>;
  }
}

function toRecord(kind: TaxonomyKind, value: unknown): TaxonomyRecord {
  const record = value as Record<string, unknown>;
  return {
    id: stringifyId(record._id),
    tenantId: stringifyId(record.tenantId),
    kind,
    name: String(record.name),
    normalizedName: String(record.normalizedName),
    description: typeof record.description === "string" ? record.description : null,
    status: record.status as TaxonomyStatus,
    version: Number(record.version),
    createdBy: stringifyId(record.createdBy),
    updatedBy: stringifyId(record.updatedBy),
    createdAt: dateValue(record.createdAt),
    updatedAt: dateValue(record.updatedAt),
    ...(kind === "classification" ? { level: record.level as ClassificationLevel } : {}),
  };
}

function stringifyId(value: unknown): string {
  return typeof value === "string"
    ? value
    : (value as { toString(): string }).toString();
}

function dateValue(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function assertObjectId(value: string): void {
  if (!mongoose.isObjectIdOrHexString(value)) {
    throw new AppError(400, MALFORMED_OBJECT_ID, "Malformed identifier");
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
