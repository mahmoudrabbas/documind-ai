import type { Model } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { BAD_REQUEST } from "../../common/errors/errorCodes.js";

type QueryFilter = Record<string, unknown>;
type FindOneFilter<T> = Parameters<Model<T>["findOne"]>[0];
type FindFilter<T> = Parameters<Model<T>["find"]>[0];
type UpdateOneFilter<T> = Parameters<Model<T>["updateOne"]>[0];
type UpdateOneUpdate<T> = Parameters<Model<T>["updateOne"]>[1];

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

function tenantScopedFilter(tenantId: string, filter?: QueryFilter) {
  return {
    ...(filter ?? {}),
    tenantId,
  };
}

export function tenantScopedFindOne<T extends object>(
  model: Model<T>,
  tenantId: unknown,
  filter: FindOneFilter<T>,
) {
  return model.findOne(tenantScopedFilter(validateTenantId(tenantId), filter) as FindOneFilter<T>);
}

export function tenantScopedFind<T extends object>(
  model: Model<T>,
  tenantId: unknown,
  filter: FindFilter<T>,
) {
  return model.find(tenantScopedFilter(validateTenantId(tenantId), filter) as FindFilter<T>);
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
  filter: UpdateOneFilter<T>,
  update: UpdateOneUpdate<T>,
  options?: Parameters<Model<T>["updateOne"]>[2],
) {
  return model.updateOne(
    tenantScopedFilter(validateTenantId(tenantId), filter) as UpdateOneFilter<T>,
    update,
    options,
  );
}

export function tenantScopedDeleteOne<T extends object>(
  model: Model<T>,
  tenantId: unknown,
  filter: FindOneFilter<T>,
) {
  return model.deleteOne(tenantScopedFilter(validateTenantId(tenantId), filter) as FindOneFilter<T>);
}

export function tenantScopedCreate<T extends object>(
  model: Model<T>,
  document: T & { tenantId: unknown },
) {
  validateTenantId(document.tenantId);

  return model.create(document);
}

export { validateTenantId as requireTenantId };
