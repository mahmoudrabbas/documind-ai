/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { TenantProvider, useTenantSettings } from "../tenant-provider";
import { LOCALE_COOKIE_NAME, LOCALE_EXPLICIT_COOKIE_NAME } from "@/lib/i18n";
import * as settingsService from "@/services/settings.service";
import type {
  GetSettingsResponse,
  TenantSettings,
} from "@/types/api/settings.types";

const mockSetLocale = vi.fn();
const mockAuth = {
  status: "authenticated",
  user: { role: "COMPANY_ADMIN" },
};
const mockPermissions = {
  status: "ready",
  can: vi.fn().mockReturnValue(true),
};

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("@/providers/permission-provider", () => ({
  usePermissions: () => mockPermissions,
}));

vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({
    locale: "ar",
    dir: "rtl",
    t: (k: string) => k,
    tPlural: (k: string) => k,
    setLocale: mockSetLocale,
  }),
}));

const mockTenantSettings: TenantSettings = {
  defaultLanguage: "en",
  profile: { companyName: "Test Co", logoUrl: null, timezone: "UTC" },
  aiRuntimePreferences: {
    temperature: 0.7,
    maxTokens: 2048,
    responseStyle: "balanced",
    citationsEnabled: true,
  },
};

/**
 * A `GET /settings` response in the shape the service actually returns —
 * `{ success, data }`. Typed rather than cast so a change to the response
 * contract fails here instead of being silently absorbed by the mock.
 */
function settingsResponse(
  overrides?: Partial<TenantSettings>,
): GetSettingsResponse {
  return {
    success: true,
    data: {
      settings: { ...mockTenantSettings, ...overrides },
      settingsVersion: 1,
      settingsUpdatedAt: null,
    },
  };
}

describe("TenantProvider locale persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = `${LOCALE_COOKIE_NAME}=; max-age=0; path=/`;
    document.cookie = `${LOCALE_EXPLICIT_COOKIE_NAME}=; max-age=0; path=/`;
  });

  function renderProvider() {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TenantProvider>{children}</TenantProvider>
    );
    return renderHook(() => useTenantSettings(), { wrapper });
  }

  it("does not override the active locale when the user chose one themselves", async () => {
    document.cookie = `${LOCALE_COOKIE_NAME}=ar; path=/`;
    document.cookie = `${LOCALE_EXPLICIT_COOKIE_NAME}=1; path=/`;

    vi.spyOn(settingsService, "getTenantSettings").mockResolvedValue(
      settingsResponse(),
    );

    const { result } = renderProvider();

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(mockSetLocale).not.toHaveBeenCalled();
  });

  it("applies tenant defaultLanguage when the user has made no choice", async () => {
    vi.spyOn(settingsService, "getTenantSettings").mockResolvedValue(
      settingsResponse({ defaultLanguage: "ar" }),
    );

    const { result } = renderProvider();

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(mockSetLocale).toHaveBeenCalledWith("ar", { explicit: false });
  });

  /* Regression: the tenant default is itself written to the locale cookie so
     the server can paint the right direction. Treating that cookie as consent
     froze the user on whichever default was current at their first visit. */
  it("still applies tenant defaultLanguage when only a system-set locale cookie exists", async () => {
    document.cookie = `${LOCALE_COOKIE_NAME}=en; path=/`;

    vi.spyOn(settingsService, "getTenantSettings").mockResolvedValue(
      settingsResponse({ defaultLanguage: "ar" }),
    );

    const { result } = renderProvider();

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(mockSetLocale).toHaveBeenCalledWith("ar", { explicit: false });
  });

  it("applies a changed defaultLanguage when applyUpdated is called", async () => {
    document.cookie = `${LOCALE_COOKIE_NAME}=ar; path=/`;
    document.cookie = `${LOCALE_EXPLICIT_COOKIE_NAME}=1; path=/`;

    vi.spyOn(settingsService, "getTenantSettings").mockResolvedValue(
      settingsResponse({ defaultLanguage: "ar" }),
    );

    const { result } = renderProvider();

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      result.current.applyUpdated({
        settings: { ...mockTenantSettings, defaultLanguage: "en" },
        settingsVersion: 2,
        settingsUpdatedAt: "2026-08-16T00:00:00.000Z",
      });
    });

    expect(mockSetLocale).toHaveBeenCalledWith("en", { explicit: false });
  });

  /* Regression: applyUpdated fires on every settings save, so re-applying the
     tenant default unconditionally let an unrelated edit replace whatever
     language the acting admin had picked for themselves. */
  it("leaves the locale alone when a save does not change defaultLanguage", async () => {
    document.cookie = `${LOCALE_COOKIE_NAME}=ar; path=/`;
    document.cookie = `${LOCALE_EXPLICIT_COOKIE_NAME}=1; path=/`;

    vi.spyOn(settingsService, "getTenantSettings").mockResolvedValue(
      settingsResponse({ defaultLanguage: "en" }),
    );

    const { result } = renderProvider();

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      result.current.applyUpdated({
        settings: {
          ...mockTenantSettings,
          defaultLanguage: "en",
          profile: {
            companyName: "Renamed Co",
            logoUrl: null,
            timezone: "Africa/Cairo",
          },
        },
        settingsVersion: 2,
        settingsUpdatedAt: "2026-08-16T00:00:00.000Z",
      });
    });

    expect(mockSetLocale).not.toHaveBeenCalled();
    expect(result.current.status).toBe("ready");
  });
});
