import mongoose, { Schema } from "mongoose";
const tenantSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 120,
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        minlength: 2,
        maxlength: 80,
    },
    status: {
        type: String,
        enum: ["active", "trial", "pending", "pending_verification"],
        default: "pending_verification",
    },
    plan: {
        type: String,
        enum: ["free", "trial", "pro"],
        default: "free",
    },
}, {
    timestamps: true,
    toJSON: {
        transform(_doc, ret) {
            const record = ret;
            record.id = record._id?.toString?.() ?? "";
            delete record._id;
            delete record.__v;
            return record;
        },
    },
});
tenantSchema.index({ status: 1 });
const TenantModel = mongoose.model("Tenant", tenantSchema);
export default TenantModel;
//# sourceMappingURL=tenant.model.js.map