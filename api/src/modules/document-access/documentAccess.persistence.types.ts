import type { BaseRole } from "../../common/auth/baseRoles.js";
import type { DocumentAccessPolicy } from "./documentAccess.types.js";

export interface DocumentPolicyPointer {
  policyId: string;
  policyVersion: number;
}

export interface DocumentPolicyDocumentRecord {
  id: string;
  tenantId: string;
  ownerId: string | null;
  uploadedBy: string;
  activePolicy: DocumentPolicyPointer | null;
  fileVersion: number;
  versionLabel: string;
}

export interface DocumentPolicyHistoryPage {
  policies: DocumentAccessPolicy[];
  nextCursor: number | null;
}

export interface InitialPolicyWrite {
  policy: DocumentAccessPolicy;
  expectedActivePolicy: null;
}

export interface NextPolicyWrite {
  policy: DocumentAccessPolicy;
  expectedActivePolicy: DocumentPolicyPointer;
}

export type DocumentPolicyWriteResult =
  | { outcome: "created"; policy: DocumentAccessPolicy }
  | { outcome: "document_not_found" }
  | { outcome: "stale" }
  | { outcome: "version_conflict" };

export type DocumentPolicyActivationResult =
  | { outcome: "activated"; policy: DocumentAccessPolicy }
  | { outcome: "document_not_found" }
  | { outcome: "policy_not_found" }
  | { outcome: "stale" };

export interface DocumentAccessPolicyRepository {
  createInitial(
    tenantId: string,
    documentId: string,
    write: InitialPolicyWrite,
  ): Promise<DocumentPolicyWriteResult>;
  createNextAndActivate(
    tenantId: string,
    documentId: string,
    write: NextPolicyWrite,
  ): Promise<DocumentPolicyWriteResult>;
  findExact(
    tenantId: string,
    documentId: string,
    policyId: string,
    policyVersion: number,
  ): Promise<DocumentAccessPolicy | null>;
  findActive(tenantId: string, documentId: string): Promise<DocumentAccessPolicy | null>;
  findLatest(
    tenantId: string,
    documentId: string,
    policyId: string,
  ): Promise<DocumentAccessPolicy | null>;
  listHistory(
    tenantId: string,
    documentId: string,
    cursor: number | null,
    limit: number,
  ): Promise<DocumentPolicyHistoryPage>;
  activateExact(
    tenantId: string,
    documentId: string,
    target: DocumentPolicyPointer,
    expectedActivePolicy: DocumentPolicyPointer | null,
  ): Promise<DocumentPolicyActivationResult>;
}

export interface DocumentPolicyReferencePort {
  findDocument(tenantId: string, documentId: string): Promise<DocumentPolicyDocumentRecord | null>;
  findUser(
    tenantId: string,
    userId: string,
  ): Promise<{ id: string; status: string; role: BaseRole } | null>;
  findRole(
    tenantId: string,
    roleId: string,
  ): Promise<{
    id: string;
    status: "active" | "archived";
    migrationState: "complete" | "quarantined";
  } | null>;
  findTaxonomy(
    tenantId: string,
    kind: "category" | "department" | "classification",
    id: string,
  ): Promise<{ id: string; status: "active" | "archived" } | null>;
}

export interface DocumentPolicyOperationContext {
  tenantId: string;
  actorId: string;
}

export interface DocumentPolicyAuthorizationPort {
  authorizeRead(context: DocumentPolicyOperationContext): Promise<void>;
  /** Must represent canonical manage-access authority; Phase 3 provides no default mapping. */
  authorizeMutation(context: DocumentPolicyOperationContext): Promise<void>;
}
