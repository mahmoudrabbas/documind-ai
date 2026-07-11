import mongoose, { Schema } from "mongoose";

export interface PlatformSettingDocument extends mongoose.Document {
  key: string;
  value: Record<string, unknown>;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const platformSettingSchema = new Schema<PlatformSettingDocument>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true, default: {} },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

const PlatformSettingModel = mongoose.model<PlatformSettingDocument>(
  "PlatformSetting",
  platformSettingSchema,
);
export default PlatformSettingModel;
