import mongoose from "mongoose";
export interface PlatformSettingDocument extends mongoose.Document {
    key: string;
    value: Record<string, unknown>;
    updatedBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
declare const PlatformSettingModel: mongoose.Model<PlatformSettingDocument, {}, {}, {}, mongoose.Document<unknown, {}, PlatformSettingDocument, {}, mongoose.DefaultSchemaOptions> & PlatformSettingDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, PlatformSettingDocument>;
export default PlatformSettingModel;
//# sourceMappingURL=platformSetting.model.d.ts.map