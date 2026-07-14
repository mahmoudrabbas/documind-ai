import mongoose from "mongoose";
export interface PackageLimits {
    users: number;
    documents: number;
    questionsPerMonth: number;
    storageMb: number;
}
export interface PackageDocument extends mongoose.Document {
    name: string;
    code: string;
    description: string;
    active: boolean;
    version: number;
    monthlyPrice: number;
    currency: string;
    limits: PackageLimits;
    versions: Array<{
        version: number;
        monthlyPrice: number;
        limits: PackageLimits;
        createdAt: Date;
    }>;
    createdAt: Date;
    updatedAt: Date;
}
declare const PackageModel: mongoose.Model<PackageDocument, {}, {}, {}, mongoose.Document<unknown, {}, PackageDocument, {}, mongoose.DefaultSchemaOptions> & PackageDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, PackageDocument>;
export default PackageModel;
//# sourceMappingURL=package.model.d.ts.map