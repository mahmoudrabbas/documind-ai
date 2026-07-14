import mongoose, { Schema } from "mongoose";
const roleSchema = new Schema({
    tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 50,
    },
    normalizedName: {
        type: String,
        required: true,
    },
    baseRole: {
        type: String,
        enum: ["COMPANY_ADMIN", "EMPLOYEE"],
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
            delete record.normalizedName;
            return record;
        },
    },
});
roleSchema.index({ tenantId: 1, normalizedName: 1 }, { unique: true, name: "uniq_role_tenant_name" });
const RoleModel = mongoose.model("Role", roleSchema);
export default RoleModel;
//# sourceMappingURL=role.model.js.map