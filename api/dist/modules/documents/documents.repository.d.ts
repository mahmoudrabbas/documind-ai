import { type DocumentDocument } from "../../db/models/document.model.js";
export declare function createDocument(data: Omit<DocumentDocument, "_id" | "createdAt" | "updatedAt">): Promise<import("mongoose").Document<unknown, {}, DocumentDocument, {}, import("mongoose").DefaultSchemaOptions> & DocumentDocument & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}>;
export declare function findDocumentsByTenant(tenantId: string, page: number, pageSize: number, filter?: Record<string, unknown>): Promise<DocumentDocument[]>;
export declare function countDocumentsByTenant(tenantId: string, filter?: Record<string, unknown>): Promise<number>;
export declare function findDocumentByTenantAndId(tenantId: string, documentId: string): Promise<any>;
export declare function updateDocumentByTenantAndId(tenantId: string, documentId: string, update: Partial<DocumentDocument>): Promise<import("mongoose").UpdateWriteOpResult>;
export declare function deleteDocumentByTenantAndId(tenantId: string, documentId: string): Promise<import("mongodb").DeleteResult>;
//# sourceMappingURL=documents.repository.d.ts.map