import mongoose, { Schema } from "mongoose";
const limitsSchema = new Schema({
    users: { type: Number, required: true, min: 1 },
    documents: { type: Number, required: true, min: 0 },
    questionsPerMonth: { type: Number, required: true, min: 0 },
    storageMb: { type: Number, required: true, min: 0 },
}, { _id: false });
const packageSchema = new Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        maxlength: 50,
    },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    active: { type: Boolean, default: true, index: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    monthlyPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, trim: true, uppercase: true, default: "USD" },
    limits: { type: limitsSchema, required: true },
    versions: {
        type: [
            new Schema({
                version: { type: Number, required: true },
                monthlyPrice: { type: Number, required: true },
                limits: { type: limitsSchema, required: true },
                createdAt: { type: Date, required: true },
            }, { _id: false }),
        ],
        default: [],
    },
}, { timestamps: true });
const PackageModel = mongoose.model("Package", packageSchema);
export default PackageModel;
//# sourceMappingURL=package.model.js.map