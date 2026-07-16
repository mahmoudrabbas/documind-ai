import PackageModel from "../../db/models/package.model.js";
import type { PublicPackageDTO } from "./public.types.js";

export async function listPublicPackages(): Promise<PublicPackageDTO[]> {
  const packages = await PackageModel.find({ active: true })
    .sort({ monthlyPrice: 1 })
    .lean()
    .exec();

  return packages.map((pkg) => ({
    _id: String(pkg._id),
    name: pkg.name,
    code: pkg.code,
    description: pkg.description ?? "",
    monthlyPrice: pkg.monthlyPrice,
    annualPrice: pkg.annualPrice ?? 0,
    currency: pkg.currency,
    trialDays: pkg.trialDays ?? 30,
    entitlements: {
      employees: pkg.entitlements.employees,
      documents: pkg.entitlements.documents,
      storageMb: pkg.entitlements.storageMb,
      queriesPerMonth: pkg.entitlements.queriesPerMonth,
    },
  }));
}
