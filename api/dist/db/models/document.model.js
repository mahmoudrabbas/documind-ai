import mongoose, { Schema } from "mongoose";
const documentSchema = new Schema({
    tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        index: true,
    },
    fileName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 255,
    },
    fileSize: {
        type: Number,
        required: true,
        min: 0,
    },
    mimeType: {
        type: String,
        required: true,
    },
    storagePath: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ["uploading", "uploaded", "processing", "processed", "failed"],
        default: "uploaded",
    },
    metadata: {
        title: { type: String, default: null, maxlength: 200 },
        description: { type: String, default: null, maxlength: 1000 },
        tags: { type: [String], default: [], maxlength: 10 },
    },
    uploadedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
}, {
    timestamps: true,
    toJSON: {
        transform(_doc, ret) {
            const record = ret;
            record.id = record._id?.toString?.() ?? "";
            delete record._id;
            delete record.__v;
            delete record.storagePath;
            return record;
        },
    },
});
documentSchema.index({ tenantId: 1, createdAt: -1 });
documentSchema.index({ tenantId: 1, status: 1 });
const DocumentModel = mongoose.model("Document", documentSchema);
export default DocumentModel;
//# sourceMappingURL=document.model.js.map