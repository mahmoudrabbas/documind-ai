import { Permission, type PermissionValue } from "../permissions/permissions.catalog.js";
import type { PermissionEvaluator } from "../permissions/permissions.types.js";
import type { DocumentAccessAction } from "./documentAccess.actions.js";
import type {
  DocumentAccessActorContext,
  DocumentAccessResourceContext,
} from "./documentAccess.types.js";

export type DocumentCapabilityReason = "CAPABILITY_ALLOWED" | "CAPABILITY_DENIED" | "ACTION_UNMAPPED";

export interface DocumentCapabilityDecision {
  allowed: boolean;
  reason: DocumentCapabilityReason;
  permission: PermissionValue | null;
}

export interface DocumentCapabilityEvaluator {
  evaluateCapability(input: {
    actor: DocumentAccessActorContext;
    resource: DocumentAccessResourceContext;
    action: DocumentAccessAction;
  }): Promise<DocumentCapabilityDecision>;
}

export const DOCUMENT_ACTION_PERMISSION_MAP: Readonly<
  Partial<Record<DocumentAccessAction, PermissionValue>>
> = Object.freeze({
  discover: Permission.DOCUMENTS_READ,
  read: Permission.DOCUMENTS_READ,
  download: Permission.DOCUMENTS_DOWNLOAD,
  update: Permission.DOCUMENTS_UPDATE,
  delete: Permission.DOCUMENTS_DELETE,
  archive: Permission.DOCUMENTS_ARCHIVE,
  restore: Permission.DOCUMENTS_ARCHIVE,
  replace: Permission.DOCUMENTS_UPDATE,
  reprocess: Permission.DOCUMENTS_OCR_PROCESS,
});

export class PermissionEvaluatorDocumentCapabilityAdapter
  implements DocumentCapabilityEvaluator
{
  constructor(private readonly permissionEvaluator: PermissionEvaluator) {}

  async evaluateCapability(input: {
    actor: DocumentAccessActorContext;
    resource: DocumentAccessResourceContext;
    action: DocumentAccessAction;
  }): Promise<DocumentCapabilityDecision> {
    const permission = DOCUMENT_ACTION_PERMISSION_MAP[input.action];
    if (!permission) {
      return { allowed: false, reason: "ACTION_UNMAPPED", permission: null };
    }

    const decision = await this.permissionEvaluator.evaluate({
      actorId: input.actor.actorId,
      tenantId: input.actor.tenantId,
      baseRole: input.actor.baseRole,
      ...(input.actor.customRoleId
        ? { customRoleId: input.actor.customRoleId }
        : {}),
      permission,
      resource: {
        tenantId: input.resource.tenantId,
        ...(input.resource.ownerId ? { ownerId: input.resource.ownerId } : {}),
        ...(input.resource.departmentId ? { departmentId: input.resource.departmentId } : {}),
        ...(input.resource.categoryId
          ? { documentCategory: input.resource.categoryId }
          : input.resource.legacyCategory
            ? { documentCategory: input.resource.legacyCategory }
            : {}),
        ...(input.resource.classification
          ? { documentClassification: input.resource.classification }
          : input.resource.classificationId
            ? { documentClassification: input.resource.classificationId }
            : {}),
      },
    });

    return {
      allowed: decision.allowed,
      reason: decision.allowed ? "CAPABILITY_ALLOWED" : "CAPABILITY_DENIED",
      permission,
    };
  }
}

export class InMemoryDocumentCapabilityEvaluator implements DocumentCapabilityEvaluator {
  private readonly decisions = new Map<string, boolean>();

  constructor(private readonly defaultAllowed = false) {}

  set(actorId: string, tenantId: string, action: DocumentAccessAction, allowed: boolean): void {
    this.decisions.set(this.key(actorId, tenantId, action), allowed);
  }

  async evaluateCapability(input: {
    actor: DocumentAccessActorContext;
    resource: DocumentAccessResourceContext;
    action: DocumentAccessAction;
  }): Promise<DocumentCapabilityDecision> {
    const permission = DOCUMENT_ACTION_PERMISSION_MAP[input.action] ?? null;
    const configured = this.decisions.get(
      this.key(input.actor.actorId, input.actor.tenantId, input.action),
    );
    const allowed = configured ?? this.defaultAllowed;
    return {
      allowed,
      reason: allowed ? "CAPABILITY_ALLOWED" : permission ? "CAPABILITY_DENIED" : "ACTION_UNMAPPED",
      permission,
    };
  }

  private key(actorId: string, tenantId: string, action: DocumentAccessAction): string {
    return `${tenantId}:${actorId}:${action}`;
  }
}
