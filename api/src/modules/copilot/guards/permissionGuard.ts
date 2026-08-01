import type { ToolContext } from "../copilot.types.js";

export async function verifyToolPermission(
  requiredPermission: string | null,
  context: ToolContext,
  authorizeTenantOp: (context: { tenantId: string; actorId: string; actorEmail: string; actorRole: string; traceId: string; requestId: string }, permission: string) => Promise<{ tenantId: string; actorId: string }>,
): Promise<{ allowed: boolean; reason: string | null }> {
  if (!requiredPermission) {
    return { allowed: true, reason: null };
  }
  try {
    await authorizeTenantOp(
      {
        tenantId: context.tenantId,
        actorId: context.actorId,
        actorEmail: context.actorEmail,
        actorRole: context.actorRole,
        traceId: context.traceId,
        requestId: context.requestId,
      },
      requiredPermission,
    );
    return { allowed: true, reason: null };
  } catch {
    return { allowed: false, reason: `Missing permission: ${requiredPermission}` };
  }
}
