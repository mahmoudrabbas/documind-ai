import mongoose, { Schema } from "mongoose";
const platformSettingSchema = new Schema({
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true, default: {} },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
const PlatformSettingModel = mongoose.model("PlatformSetting", platformSettingSchema);
export default PlatformSettingModel;
//# sourceMappingURL=platformSetting.model.js.map