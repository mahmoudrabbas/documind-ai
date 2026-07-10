import mongoose from "mongoose";
export interface DocumentDocument extends mongoose.Document {
    tenantId: mongoose.Types.ObjectId;
    fileName: string;
    fileSize: number;
    mimeType: string;
    storagePath: string;
    status: "uploading" | "uploaded" | "processing" | "processed" | "failed";
    metadata: {
        title: string | null;
        description: string | null;
        tags: string[];
    };
    uploadedBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
declare const DocumentModel: mongoose.Model<DocumentDocument, {}, {}, {}, mongoose.Document<unknown, {}, DocumentDocument, {}, mongoose.DefaultSchemaOptions> & DocumentDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, DocumentDocument>;
export default DocumentModel;
//# sourceMappingURL=document.model.d.ts.map