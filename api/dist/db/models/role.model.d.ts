import mongoose from "mongoose";
export interface RoleDocument extends mongoose.Document {
    tenantId: mongoose.Types.ObjectId;
    name: string;
    normalizedName: string;
    baseRole: "COMPANY_ADMIN" | "EMPLOYEE";
    createdAt: Date;
    updatedAt: Date;
}
declare const RoleModel: mongoose.Model<RoleDocument, {}, {}, {}, mongoose.Document<unknown, {}, RoleDocument, {}, mongoose.DefaultSchemaOptions> & RoleDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, RoleDocument>;
export default RoleModel;
//# sourceMappingURL=role.model.d.ts.map