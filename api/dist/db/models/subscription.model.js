import mongoose, { Schema } from "mongoose";
const subscriptionSchema = new Schema({
    tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        unique: true,
    },
    packageId: {
        type: Schema.Types.ObjectId,
        ref: "Package",
        required: true,
        index: true,
    },
    packageVersion: { type: Number, required: true, min: 1 },
    status: {
        type: String,
        enum: ["active", "trialing", "past_due", "cancelled"],
        default: "active",
        index: true,
    },
    startedAt: { type: Date, required: true, default: Date.now },
    renewsAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
}, { timestamps: true });
const SubscriptionModel = mongoose.model("Subscription", subscriptionSchema);
export default SubscriptionModel;
//# sourceMappingURL=subscription.model.js.map