import type { UploadDocumentResult, ListDocumentsResult, UpdateDocumentMetadataResult } from "./documents.types.js";
type MulterFile = {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    buffer: Buffer;
    size: number;
    filename?: string;
};
export declare function uploadDocument(file: MulterFile, metadataInput: unknown, tenantId: string, userId: string): Promise<UploadDocumentResult>;
export declare function listDocuments(input: unknown, tenantId: string): Promise<ListDocumentsResult>;
export declare function getDocument(documentId: string, tenantId: string): Promise<UploadDocumentResult>;
export declare function updateDocumentMetadata(documentId: string, input: unknown, tenantId: string, userId: string): Promise<UpdateDocumentMetadataResult>;
export declare function deleteDocument(documentId: string, tenantId: string, userId: string): Promise<void>;
export {};
//# sourceMappingURL=documents.service.d.ts.map