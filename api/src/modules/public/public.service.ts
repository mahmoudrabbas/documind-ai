import PackageModel from "../../db/models/package.model.js";
import type { PublicPackageDTO } from "./public.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mapper at the boundary, accept any shape
function mapToPublicDTO(pkg: any): PublicPackageDTO {
  const e = pkg.entitlements;
  return {
    id: String(pkg._id),
    name: pkg.name,
    code: pkg.code,
    description: pkg.description,
    monthlyPrice: pkg.monthlyPrice,
    annualPrice: pkg.annualPrice,
    currency: pkg.currency,
    trialDays: pkg.trialDays,
    entitlements: {
      employees: e?.employees ?? 0,
      documents: e?.documents ?? 0,
      storageMb: e?.storageMb ?? 0,
      queriesPerMonth: e?.queriesPerMonth ?? 0,
    },
    supportedModels: pkg.supportedModels,
    analyticsLevel: pkg.analyticsLevel,
    supportLevel: pkg.supportLevel,
    retentionDays: pkg.retentionDays,
  };
}

export async function listPublicPackages(): Promise<PublicPackageDTO[]> {
  const packages = await PackageModel.find({ active: true, visibility: "public" })
    .sort({ monthlyPrice: 1 })
    .lean()
    .exec();
  return packages.map(mapToPublicDTO);
}
