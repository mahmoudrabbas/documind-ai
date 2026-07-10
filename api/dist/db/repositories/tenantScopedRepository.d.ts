import type { Model, QueryFilter, UpdateQuery } from "mongoose";
declare function validateTenantId(tenantId: unknown): string;
export declare function tenantScopedFindOne<T extends object>(model: Model<T>, tenantId: unknown, filter: QueryFilter<T>): import("mongoose").Query<(import("mongoose").Document<unknown, {}, T, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").Require_id<T> & {
    __v: number;
} & import("mongoose").AddDefaultId<T, {}, import("mongoose").DefaultSchemaOptions>) | null, import("mongoose").Document<unknown, {}, T, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").Require_id<T> & {
    __v: number;
} & import("mongoose").AddDefaultId<T, {}, import("mongoose").DefaultSchemaOptions>, {}, T, "findOne", {}>;
export declare function tenantScopedFind<T extends object>(model: Model<T>, tenantId: unknown, filter: QueryFilter<T>): import("mongoose").Query<(import("mongoose").Document<unknown, {}, T, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").Require_id<T> & {
    __v: number;
} & import("mongoose").AddDefaultId<T, {}, import("mongoose").DefaultSchemaOptions>)[], import("mongoose").Document<unknown, {}, T, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").Require_id<T> & {
    __v: number;
} & import("mongoose").AddDefaultId<T, {}, import("mongoose").DefaultSchemaOptions>, {}, T, "find", {}>;
export declare function tenantScopedFindById<T extends object>(model: Model<T>, tenantId: unknown, id: string): import("mongoose").Query<(import("mongoose").Document<unknown, {}, T, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").Require_id<T> & {
    __v: number;
} & import("mongoose").AddDefaultId<T, {}, import("mongoose").DefaultSchemaOptions>) | null, import("mongoose").Document<unknown, {}, T, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").Require_id<T> & {
    __v: number;
} & import("mongoose").AddDefaultId<T, {}, import("mongoose").DefaultSchemaOptions>, {}, T, "findOne", {}>;
export declare function tenantScopedUpdateOne<T extends object>(model: Model<T>, tenantId: unknown, filter: QueryFilter<T>, update: UpdateQuery<T>, options?: Parameters<Model<T>["updateOne"]>[2]): import("mongoose").Query<import("mongoose").UpdateWriteOpResult, import("mongoose").Document<unknown, {}, T, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").Require_id<T> & {
    __v: number;
} & import("mongoose").AddDefaultId<T, {}, import("mongoose").DefaultSchemaOptions>, {}, T, "updateOne", {}>;
export declare function tenantScopedDeleteOne<T extends object>(model: Model<T>, tenantId: unknown, filter: QueryFilter<T>): import("mongoose").Query<import("mongodb").DeleteResult, import("mongoose").Document<unknown, {}, T, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").Require_id<T> & {
    __v: number;
} & import("mongoose").AddDefaultId<T, {}, import("mongoose").DefaultSchemaOptions>, {}, T, "deleteOne", {}>;
export declare function tenantScopedCreate<T extends object>(model: Model<T>, document: T & {
    tenantId: unknown;
}): Promise<import("mongoose").Document<unknown, {}, T, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").Require_id<T> & {
    __v: number;
} & import("mongoose").AddDefaultId<T, {}, import("mongoose").DefaultSchemaOptions>>;
export { validateTenantId as requireTenantId };
//# sourceMappingURL=tenantScopedRepository.d.ts.map