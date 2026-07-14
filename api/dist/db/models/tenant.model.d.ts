import mongoose from "mongoose";
export interface TenantDocument extends mongoose.Document {
    name: string;
    slug: string;
    status: string;
    plan: string;
    isSystemTenant: boolean;
    selectedPackageCode?: string;
    createdAt: Date;
    updatedAt: Date;
}
declare const TenantModel: mongoose.Model<TenantDocument, {}, {}, {}, mongoose.Document<unknown, {}, TenantDocument, {}, mongoose.DefaultSchemaOptions> & TenantDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, TenantDocument>;
export default TenantModel;
//# sourceMappingURL=tenant.model.d.ts.map