export interface PublicPackageEntitlement {
  employees: number;
  documents: number;
  storageMb: number;
  queriesPerMonth: number;
}

export interface PublicPackageDTO {
  id: string;
  name: string;
  code: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  trialDays: number;
  entitlements: PublicPackageEntitlement;
  supportedModels: string[];
  analyticsLevel: string;
  supportLevel: string;
  retentionDays: number;
}
