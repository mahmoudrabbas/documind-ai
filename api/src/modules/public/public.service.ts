import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { NOT_FOUND } from "../../common/errors/errorCodes.js";
import { storageProvider } from "../../providers/storage/index.js";
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
    monthlyPriceCents: pkg.monthlyPrice,
    annualPriceCents: pkg.annualPrice,
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

/* ------------------------------------------------------------------ */
/*  Tenant logo serving                                               */
/* ------------------------------------------------------------------ */

const LOGO_FILE_NAME_PATTERN = /^[a-f0-9-]{8,64}\.(png|jpe?g|webp|gif|svg)$/i;

function logoContentTypeFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

export interface TenantLogoAsset {
  buffer: Buffer;
  contentType: string;
}

/**
 * Reads an uploaded tenant logo from storage. The endpoint is unauthenticated
 * because logos are embedded in outgoing email HTML, but file names are
 * unguessable UUIDs, so only the tenant that uploaded a logo (or a party that
 * was given its URL) can fetch it.
 */
export async function getTenantLogo(
  tenantId: string,
  fileName: string,
): Promise<TenantLogoAsset> {
  const notFound = new AppError(404, NOT_FOUND, "Logo not found");

  if (
    !mongoose.isObjectIdOrHexString(tenantId) ||
    !LOGO_FILE_NAME_PATTERN.test(fileName)
  ) {
    throw notFound;
  }

  const storageKey = `${tenantId}/${fileName}`;
  let buffer: Buffer;
  try {
    buffer = await storageProvider.getFileBuffer(storageKey);
  } catch {
    throw notFound;
  }

  return {
    buffer,
    contentType: logoContentTypeFromFileName(fileName),
  };
}
