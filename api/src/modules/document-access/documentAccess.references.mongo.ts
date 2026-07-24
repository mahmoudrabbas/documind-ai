import DocumentModel from "../../db/models/document.model.js";
import RoleModel from "../../db/models/role.model.js";
import UserModel from "../../db/models/user.model.js";
import { MongoDocumentTaxonomyRepository } from "../document-taxonomy/documentTaxonomy.repository.mongo.js";
import type { DocumentPolicyReferencePort } from "./documentAccess.persistence.types.js";

export class MongoDocumentPolicyReferencePort implements DocumentPolicyReferencePort {
  private readonly taxonomy = new MongoDocumentTaxonomyRepository();

  async findDocument(tenantId: string, documentId: string) {
    const document = await DocumentModel.findOne({ _id: documentId, tenantId })
      .select("tenantId owner uploadedBy activePolicyId activePolicyVersion version versionLabel")
      .lean()
      .exec();
    if (!document) return null;
    return {
      id: document._id.toString(),
      tenantId: document.tenantId.toString(),
      ownerId: document.owner?.toString() ?? null,
      uploadedBy: document.uploadedBy.toString(),
      activePolicy: document.activePolicyId && document.activePolicyVersion
        ? {
            policyId: document.activePolicyId.toString(),
            policyVersion: document.activePolicyVersion,
          }
        : null,
      fileVersion: document.version,
      versionLabel: document.versionLabel,
    };
  }

  async findUser(tenantId: string, userId: string) {
    const user = await UserModel.findOne({ _id: userId, tenantId })
      .select("status role")
      .lean()
      .exec();
    return user ? { id: user._id.toString(), status: user.status, role: user.role } : null;
  }

  async findRole(tenantId: string, roleId: string) {
    const role = await RoleModel.findOne({ _id: roleId, tenantId })
      .select("status migrationState")
      .lean()
      .exec();
    return role ? {
      id: role._id.toString(),
      status: role.status,
      migrationState: role.migrationState ?? "quarantined",
    } : null;
  }

  async findTaxonomy(
    tenantId: string,
    kind: "category" | "department" | "classification",
    id: string,
  ) {
    const record = await this.taxonomy.findByTenantAndId(tenantId, kind, id);
    return record ? { id: record.id, status: record.status } : null;
  }
}
