import type { Model, QueryFilter, UpdateQuery } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { BAD_REQUEST } from "../../common/errors/errorCodes.js";

function validateTenantId(tenantId: unknown): string {
  if (typeof tenantId !== "string") {
    throw new AppError(400, BAD_REQUEST, "tenantId is required and must be a non-empty string");
  }

  const normalizedTenantId = tenantId.trim();

  if (!normalizedTenantId) {
    throw new AppError(400, BAD_REQUEST, "tenantId is required and must be a non-empty string");
  }

  return normalizedTenantId;
}

function tenantScopedFilter<T>(tenantId: string, filter?: QueryFilter<T>) {
  return {
    ...(filter ?? {}),
    tenantId,
  } as QueryFilter<T>;
}

export function tenantScopedFindOne<T extends object>(
  model: Model<T>,
  tenantId: unknown,
  filter: QueryFilter<T>,
) {
  return model.findOne(tenantScopedFilter(validateTenantId(tenantId), filter));
}

export function tenantScopedFind<T extends object>(
  model: Model<T>,
  tenantId: unknown,
  filter: QueryFilter<T>,
) {
  return model.find(tenantScopedFilter(validateTenantId(tenantId), filter));
}

export function tenantScopedFindById<T extends object>(
  model: Model<T>,
  tenantId: unknown,
  id: string,
) {
  return model.findOne({ _id: id, tenantId: validateTenantId(tenantId) });
}

export function tenantScopedUpdateOne<T extends object>(
  model: Model<T>,
  tenantId: unknown,
  filter: QueryFilter<T>,
  update: UpdateQuery<T>,
  options?: Parameters<Model<T>["updateOne"]>[2],
) {
  return model.updateOne(
    tenantScopedFilter(validateTenantId(tenantId), filter),
    update,
    options,
  );
}

export function tenantScopedDeleteOne<T extends object>(
  model: Model<T>,
  tenantId: unknown,
  filter: QueryFilter<T>,
) {
  return model.deleteOne(tenantScopedFilter(validateTenantId(tenantId), filter));
}

export function tenantScopedCreate<T extends object>(
  model: Model<T>,
  document: T & { tenantId: unknown },
) {
  validateTenantId(document.tenantId);

  return model.create(document);
}

export { validateTenantId as requireTenantId };
