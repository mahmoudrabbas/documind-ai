import mongoose from "mongoose";
export interface UsageLogDocument extends mongoose.Document {
    tenantId: mongoose.Types.ObjectId;
    eventType: "QUESTION_ASKED" | "ASSISTANT_RESPONSE" | "SYSTEM_EVENT";
    requestId?: string;
    createdAt: Date;
}
declare const UsageLogModel: mongoose.Model<UsageLogDocument, {}, {}, {}, mongoose.Document<unknown, {}, UsageLogDocument, {}, mongoose.DefaultSchemaOptions> & UsageLogDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, UsageLogDocument>;
export default UsageLogModel;
//# sourceMappingURL=usageLog.model.d.ts.map