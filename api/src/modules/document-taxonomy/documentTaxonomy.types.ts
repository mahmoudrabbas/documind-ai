import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";

export const TAXONOMY_KINDS = ["category", "department", "classification"] as const;
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];
export type TaxonomyStatus = "active" | "archived";

export const CLASSIFICATION_LEVELS = [
  "internal",
  "restricted",
  "confidential",
  "highly_confidential",
] as const;
export type ClassificationLevel = (typeof CLASSIFICATION_LEVELS)[number];

export interface TaxonomyRecord {
  id: string;
  tenantId: string;
  kind: TaxonomyKind;
  name: string;
  normalizedName: string;
  description: string | null;
  status: TaxonomyStatus;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  level?: ClassificationLevel;
}

export interface TaxonomyView {
  id: string;
  name: string;
  description: string | null;
  status: TaxonomyStatus;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  level?: ClassificationLevel;
}

export interface CreateTaxonomyData {
  name: string;
  normalizedName: string;
  description: string | null;
  createdBy: string;
  updatedBy: string;
  level?: ClassificationLevel;
}

export interface UpdateTaxonomyData {
  expectedVersion: number;
  name?: string;
  normalizedName?: string;
  description?: string | null;
  updatedBy: string;
  level?: ClassificationLevel;
}

export interface TaxonomyListQuery {
  page: number;
  pageSize: number;
  status: TaxonomyStatus | "all";
  search?: string;
}

export interface TaxonomyListResult {
  records: TaxonomyRecord[];
  totalRecords: number;
}

export interface DocumentTaxonomyRepository {
  create(
    tenantId: string,
    kind: TaxonomyKind,
    data: CreateTaxonomyData,
  ): Promise<TaxonomyRecord>;
  findByTenantAndId(
    tenantId: string,
    kind: TaxonomyKind,
    id: string,
  ): Promise<TaxonomyRecord | null>;
  list(
    tenantId: string,
    kind: TaxonomyKind,
    query: TaxonomyListQuery,
  ): Promise<TaxonomyListResult>;
  existsByNormalizedName(
    tenantId: string,
    kind: TaxonomyKind,
    normalizedName: string,
    excludeId?: string,
  ): Promise<boolean>;
  update(
    tenantId: string,
    kind: TaxonomyKind,
    id: string,
    data: UpdateTaxonomyData,
  ): Promise<TaxonomyRecord | null>;
  changeStatus(
    tenantId: string,
    kind: TaxonomyKind,
    id: string,
    expectedVersion: number,
    status: TaxonomyStatus,
    updatedBy: string,
  ): Promise<TaxonomyRecord | null>;
}

export type TaxonomyOperationContext = OperationAuthorizationContext;

export interface TaxonomyPagination {
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
}
