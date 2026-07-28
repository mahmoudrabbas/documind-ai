import type { PackageCreateInput, PackageVersionInput } from "@/types/api/super-admin.types";

export function validatePackageInput(input: PackageCreateInput | PackageVersionInput): string | null {
  if (input.name.trim().length < 2) return "Name must contain at least 2 characters.";
  if ("code" in input && !/^[a-z0-9-]+$/.test(input.code.trim().toLowerCase()))
    return "Code may contain lowercase letters, numbers, and hyphens only.";
  for (const [label, value] of [["Monthly price", input.monthlyPrice], ["Annual price", input.annualPrice]] as const)
    if (!Number.isSafeInteger(value) || value < 0) return `${label} must be non-negative integer minor units.`;
  for (const [label, value, minimum] of [
    ["Employees", input.entitlements.employees, 1], ["Admins", input.entitlements.admins, 0],
    ["Documents", input.entitlements.documents, 0], ["Storage", input.entitlements.storageMb, 0],
    ["File size", input.entitlements.fileSizeMb, 0], ["Queries", input.entitlements.queriesPerMonth, 0],
    ["Tokens", input.entitlements.tokensPerMonth, 0], ["OCR pages", input.entitlements.ocrPagesPerMonth, 0],
    ["Trial days", input.trialDays, 0], ["Retention days", input.retentionDays, 0],
  ] as const)
    if (!Number.isSafeInteger(value) || value < minimum)
      return `${label} must be an integer of at least ${minimum}.`;
  if (!/^[A-Z]{3}$/.test(input.currency.trim().toUpperCase())) return "Currency must be a three-letter code.";
  if (!input.supportedModels.length) return "At least one supported model is required.";
  if (new Set(input.supportedModels).size !== input.supportedModels.length)
    return "Supported models must not contain duplicates.";
  return null;
}
