import PackageModel from "../../db/models/package.model.js";
export async function listActivePackages() {
    return PackageModel.find({ active: true })
        .sort({ monthlyPrice: 1 })
        .lean()
        .exec();
}
//# sourceMappingURL=public.service.js.map