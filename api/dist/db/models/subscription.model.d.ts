import mongoose from "mongoose";
export interface SubscriptionDocument extends mongoose.Document {
    tenantId: mongoose.Types.ObjectId;
    packageId: mongoose.Types.ObjectId;
    packageVersion: number;
    status: "active" | "trialing" | "past_due" | "cancelled";
    startedAt: Date;
    renewsAt: Date | null;
    cancelledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
declare const SubscriptionModel: mongoose.Model<SubscriptionDocument, {}, {}, {}, mongoose.Document<unknown, {}, SubscriptionDocument, {}, mongoose.DefaultSchemaOptions> & SubscriptionDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, SubscriptionDocument>;
export default SubscriptionModel;
//# sourceMappingURL=subscription.model.d.ts.map