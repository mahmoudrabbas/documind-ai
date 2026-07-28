import { beforeEach, describe, expect, it, vi } from "vitest";
const { authorizePlatformOperation } = vi.hoisted(() => ({ authorizePlatformOperation: vi.fn() }));
vi.mock("../../permissions/permissions.operation.js", () => ({ authorizePlatformOperation }));
vi.mock("../../../common/observability/index.js", () => ({ getAuditWriter: () => ({ write: vi.fn().mockResolvedValue(true) }) }));
import { Permission, assertPersistableTenantPermissions, getPermissionDefinition } from "../../permissions/permissions.catalog.js";
import { authorizeRefundConfirmation } from "../refund-authorization.policy.js";

const context = { tenantId: "507f1f77bcf86cd799439011", actorId: "507f1f77bcf86cd799439012", actorEmail: "platform@example.test", actorRole: "SUPER_ADMIN" as const };
describe("refund confirmation authority", () => {
  beforeEach(() => authorizePlatformOperation.mockReset());
  it("is platform-only and cannot be delegated to tenant custom roles", () => {
    expect(getPermissionDefinition(Permission.BILLING_REFUND_CONFIRM)).toMatchObject({ platformOnly: true, tenantGrantable: false, delegableByTenantAdmin: false, defaultBaseRoles: ["SUPER_ADMIN"] });
    expect(() => assertPersistableTenantPermissions([Permission.BILLING_REFUND_CONFIRM])).toThrow(/NON_DELEGABLE_PERMISSION/);
  });
  it("requires the platform guard and requester/confirmer separation", async () => {
    authorizePlatformOperation.mockResolvedValue({ ...context, actorKind: "USER" });
    await expect(authorizeRefundConfirmation(context, context.actorId)).rejects.toMatchObject({ code: "BILLING_OPERATION_NOT_ALLOWED" });
    await expect(authorizeRefundConfirmation(context, "507f1f77bcf86cd799439013")).resolves.toMatchObject({ actorId: context.actorId });
    expect(authorizePlatformOperation).toHaveBeenCalledWith(context, Permission.BILLING_REFUND_CONFIRM);
  });
});
