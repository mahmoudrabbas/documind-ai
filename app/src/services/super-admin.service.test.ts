import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getGlobalSettings,
  updateGlobalSettings,
  getAiConfiguration,
  updateAiConfiguration,
  listPackages,
  getPackage,
  createPackage,
  updatePackage,
  createPackageVersion,
  previewPackageImpact,
  archivePackage,
  activatePackage,
  getSubscriptionDetail,
  listSubscriptions,
  previewSubscriptionImpact,
  provisionSubscription,
  updateSubscription,
} from "./super-admin.service";
import type { GlobalSettings, GlobalSettingsPatch, PackageCreateInput, PackageVersionInput } from "@/types/api/super-admin.types";

const mockApiClient = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
}));

beforeEach(() => {
  mockApiClient.mockReset();
});

describe("super-admin.service subscription operations", () => {
  it("uses list, detail, and impact routes", async () => {
    mockApiClient.mockResolvedValue({ success: true, data: {} });
    await getSubscriptionDetail("tenant/id");
    await previewSubscriptionImpact("tenant/id", { action: "update", packageId: "pkg", expectedVersion: 2 });
    expect(mockApiClient).toHaveBeenNthCalledWith(1, "/platform/subscriptions/tenant%2Fid", { signal: undefined });
    expect(mockApiClient).toHaveBeenNthCalledWith(2, "/platform/subscriptions/tenant%2Fid/impact?action=update&expectedVersion=2&packageId=pkg", { signal: undefined });
  });

  it("lists subscriptions with server-side paging, search, and status params", async () => {
    mockApiClient.mockResolvedValue({ success: true, data: { subscriptions: [], pagination: { page: 2, pageSize: 20, totalPages: 3, totalRecords: 45 } } });
    const result = await listSubscriptions({ page: 2, pageSize: 20, search: "acme", status: "active" });
    expect(mockApiClient).toHaveBeenCalledWith(
      "/platform/subscriptions?page=2&pageSize=20&search=acme&status=active",
      { signal: undefined },
    );
    expect(result.data.pagination.totalRecords).toBe(45);
  });

  it("omits optional search and status params when absent", async () => {
    mockApiClient.mockResolvedValue({ success: true, data: { subscriptions: [], pagination: { page: 1, pageSize: 100, totalPages: 0, totalRecords: 0 } } });
    await listSubscriptions({ page: 1, pageSize: 100 });
    expect(mockApiClient).toHaveBeenCalledWith("/platform/subscriptions?page=1&pageSize=100", { signal: undefined });
  });

  it("uses POST for provision and PATCH for existing updates with stable caller keys", async () => {
    mockApiClient.mockResolvedValue({ success: true, data: {} });
    const provision = { packageId: "pkg", status: "trialing" as const, expectedVersion: 0 as const, reason: "Approved provisioning" };
    const update = { packageId: "pkg2", expectedVersion: 3, reason: "Approved package change" };
    await provisionSubscription("tenant", provision, "stable-provision-key");
    await updateSubscription("tenant", update, "stable-update-key");
    expect(mockApiClient).toHaveBeenNthCalledWith(1, "/platform/subscriptions/tenant", {
      method: "POST", body: provision, headers: { "Idempotency-Key": "stable-provision-key" },
    });
    expect(mockApiClient).toHaveBeenNthCalledWith(2, "/platform/subscriptions/tenant", {
      method: "PATCH", body: update, headers: { "Idempotency-Key": "stable-update-key" },
    });
  });
});

describe("super-admin.service package operations", () => {
  const createBody: PackageCreateInput = {
    name: "Professional", code: "professional", description: "For teams",
    monthlyPrice: 49, annualPrice: 490, currency: "USD", trialDays: 14,
    visibility: "public",
    entitlements: { employees: 20, admins: 2, documents: 1000, storageMb: 10000,
      fileSizeMb: 25, queriesPerMonth: 5000, tokensPerMonth: 100000, ocrPagesPerMonth: 500 },
    supportedModels: ["basic"], analyticsLevel: "advanced", retentionDays: 365,
    supportLevel: "priority",
  };
  const versionBody: PackageVersionInput = { ...createBody, expectedVersion: 2 };

  it("uses the package list and detail routes", async () => {
    mockApiClient.mockResolvedValue({ success: true, data: [] });
    await listPackages();
    await getPackage("pkg/id");
    expect(mockApiClient).toHaveBeenNthCalledWith(1, "/platform/packages", { signal: undefined });
    expect(mockApiClient).toHaveBeenNthCalledWith(2, "/platform/packages/pkg%2Fid", { signal: undefined });
  });

  it("sends typed create, patch, and immutable-version contracts", async () => {
    mockApiClient.mockResolvedValue({ success: true, data: {} });
    await createPackage(createBody);
    await updatePackage("abc", versionBody);
    await createPackageVersion("abc", versionBody);
    expect(mockApiClient).toHaveBeenNthCalledWith(1, "/platform/packages", { method: "POST", body: createBody });
    expect(mockApiClient).toHaveBeenNthCalledWith(2, "/platform/packages/abc", { method: "PATCH", body: versionBody });
    expect(mockApiClient).toHaveBeenNthCalledWith(3, "/platform/packages/abc/versions", { method: "POST", body: versionBody });
  });

  it("uses impact, archive, and activate lifecycle routes", async () => {
    mockApiClient.mockResolvedValue({ success: true, data: {} });
    const lifecycle = { expectedVersion: 2, reason: "Lifecycle review" };
    await previewPackageImpact("abc", "archive");
    await archivePackage("abc", lifecycle);
    await activatePackage("abc", lifecycle);
    expect(mockApiClient).toHaveBeenNthCalledWith(1, "/platform/packages/abc/impact?action=archive", { signal: undefined });
    expect(mockApiClient).toHaveBeenNthCalledWith(2, "/platform/packages/abc/archive", { method: "POST", body: lifecycle });
    expect(mockApiClient).toHaveBeenNthCalledWith(3, "/platform/packages/abc/activate", { method: "POST", body: lifecycle });
  });
});

describe("super-admin.service Global Settings", () => {
  it("getGlobalSettings calls /platform/settings", async () => {
    const mockSettings: GlobalSettings = {
      supportEmail: "support@example.com",
      maintenanceMode: false,
      allowRegistrations: true,
      defaultTrialDays: 14,
      dataRetentionDays: 365,
    };
    mockApiClient.mockResolvedValue({ success: true, data: mockSettings });
    const result = await getGlobalSettings();
    expect(mockApiClient).toHaveBeenCalledWith("/platform/settings", {
      signal: undefined,
    });
    expect(result.data).toEqual(mockSettings);
  });

  it("updateGlobalSettings sends patch to /platform/settings with PATCH method", async () => {
    const patch: GlobalSettingsPatch = { maintenanceMode: true };
    const updatedSettings: GlobalSettings = {
      supportEmail: "",
      maintenanceMode: true,
      allowRegistrations: true,
      defaultTrialDays: 14,
      dataRetentionDays: 365,
    };
    mockApiClient.mockResolvedValue({ success: true, data: updatedSettings });
    const result = await updateGlobalSettings(patch);
    expect(mockApiClient).toHaveBeenCalledWith("/platform/settings", {
      method: "PATCH",
      body: patch,
    });
    expect(result.data.maintenanceMode).toBe(true);
  });

  it("getAiConfiguration calls /platform/ai-configuration", async () => {
    mockApiClient.mockResolvedValue({
      success: true,
      data: { provider: "openai" },
    });
    await getAiConfiguration();
    expect(mockApiClient).toHaveBeenCalledWith("/platform/ai-configuration", {
      signal: undefined,
    });
  });

  it("updateAiConfiguration sends to /platform/ai-configuration with PATCH", async () => {
    mockApiClient.mockResolvedValue({
      success: true,
      data: { provider: "openai" },
    });
    await updateAiConfiguration({ temperature: 0.5 });
    expect(mockApiClient).toHaveBeenCalledWith("/platform/ai-configuration", {
      method: "PATCH",
      body: { temperature: 0.5 },
    });
  });

  it("GlobalSettings type has all five required fields", () => {
    const settings: GlobalSettings = {
      supportEmail: "",
      maintenanceMode: false,
      allowRegistrations: true,
      defaultTrialDays: 14,
      dataRetentionDays: 365,
    };
    expect(settings).toHaveProperty("supportEmail");
    expect(settings).toHaveProperty("maintenanceMode");
    expect(settings).toHaveProperty("allowRegistrations");
    expect(settings).toHaveProperty("defaultTrialDays");
    expect(settings).toHaveProperty("dataRetentionDays");
  });

  it("GlobalSettingsPatch allows partial updates", () => {
    const patch: GlobalSettingsPatch = { maintenanceMode: true };
    expect(patch.maintenanceMode).toBe(true);
    expect(patch.supportEmail).toBeUndefined();
  });
});
