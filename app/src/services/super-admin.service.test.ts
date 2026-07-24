import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getGlobalSettings,
  updateGlobalSettings,
  getAiConfiguration,
  updateAiConfiguration,
} from "./super-admin.service";
import type { GlobalSettings, GlobalSettingsPatch } from "@/types/api/super-admin.types";

const mockApiClient = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
}));

beforeEach(() => {
  mockApiClient.mockReset();
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
