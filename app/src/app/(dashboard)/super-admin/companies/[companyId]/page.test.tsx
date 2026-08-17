// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import CompanyDetailPage from "./page";
import { Permission } from "@/types/api/permissions.types";
import type {
  TenantDetailView,
  TenantLifecyclePreview,
} from "@/types/api/platform.types";

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "ar" }));
const i18nFns = vi.hoisted(() => ({
  // Assigned once at module load so `t`/`tPlural` keep stable references
  // across renders — the LifecycleDialog preview effect depends on them.
  t: ((_key: string, _params?: Record<string, string>) => "") as (
    key: string,
    params?: Record<string, string>,
  ) => string,
  tPlural: ((_key: string, _count: number) => "") as (
    key: string,
    count: number,
  ) => string,
}));
vi.mock("@/providers/i18n-provider", async () => {
  const { t: translate, tPlural: pluralize } = await import("@/lib/i18n/i18n.utils");
  const dictionaries = (await import("@/lib/i18n/translations")).default;
  i18nFns.t = (key: string, params?: Record<string, string>) =>
    translate(dictionaries[localeState.locale], key, params);
  i18nFns.tPlural = (key: string, count: number) =>
    pluralize(dictionaries[localeState.locale], localeState.locale, key, count);
  return {
    useI18n: () => ({
      locale: localeState.locale,
      dir: localeState.locale === "ar" ? "rtl" : "ltr",
      t: i18nFns.t,
      tPlural: i18nFns.tPlural,
      setLocale: vi.fn(),
    }),
    useIntlLocale: () => "en",
  };
});
vi.mock("@/lib/i18n/code-label", () => ({ codeLabel: (_t: unknown, _namespace: string, code: string) => code.replaceAll("_", " "), humanizeCode: (code: string) => code.replaceAll("_", " ") }));
vi.mock("@/providers/permission-provider", () => ({ usePermissions: vi.fn() }));
vi.mock("@/services/platform.service", () => ({
  getTenantDetail: vi.fn(),
  previewTenantSuspend: vi.fn(),
  previewTenantReinstate: vi.fn(),
  suspendTenant: vi.fn(),
  reinstateTenant: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ companyId: "tenant-1" }),
}));
vi.mock("next/link", async () => {
  const React = await import("react");
  return { default: (props: { href: string; children: React.ReactNode }) => React.createElement("a", props) };
});

import { usePermissions } from "@/providers/permission-provider";
import {
  getTenantDetail,
  previewTenantReinstate,
  previewTenantSuspend,
  reinstateTenant,
  suspendTenant,
} from "@/services/platform.service";

const detail: TenantDetailView = {
  id: "tenant-1",
  name: "Acme Corp",
  slug: "acme-corp",
  status: "active",
  plan: "pro",
  isSystemTenant: false,
  createdAt: "2026-01-05T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
  users: { total: 5, active: 2, companyAdmins: 2, employees: 3 },
  package: {
    packageId: "pkg-1",
    packageName: "Professional",
    packageCode: "pro",
    packageVersion: 4,
    entitlements: {
      employees: 50,
      admins: 5,
      documents: 1000,
      storageMb: 5120,
      fileSizeMb: 100,
      queriesPerMonth: 6000,
      tokensPerMonth: 50000,
      ocrPagesPerMonth: 2000,
    },
  },
  subscription: {
    subscriptionId: "sub-1",
    status: "active",
    provider: "stripe",
    periodStart: "2026-07-01T00:00:00.000Z",
    periodEnd: "2026-08-01T00:00:00.000Z",
    trialEnd: null,
    cancelAtPeriodEnd: false,
  },
  usage: { documents: 184, storageBytes: 2684354560, questions: 6240 },
  recentAudit: [
    {
      id: "a1",
      action: "TENANT.SUSPEND",
      actorEmail: "ops@example.com",
      actorRole: "SUPER_ADMIN",
      outcome: "FAILURE",
      createdAt: "2026-07-19T10:00:00.000Z",
    },
    {
      id: "a2",
      action: "TENANT.CREATE",
      actorEmail: null,
      actorRole: null,
      outcome: "SUCCESS",
      createdAt: "2026-01-05T00:00:00.000Z",
    },
  ],
};

const suspendPreview: TenantLifecyclePreview = {
  tenantId: "tenant-1",
  tenantName: "Acme Corp",
  currentStatus: "active",
  targetStatus: "suspended",
  transitionAllowed: true,
  alreadyInTargetState: false,
  totalUsersAffected: 5,
  activeUsersAffected: 2,
  activeCompanyAdminsAffected: 2,
  currentSubscriptionStatus: "active",
  documentCount: 184,
  warnings: ["The company has an active subscription that will continue billing."],
  blockingReasons: [],
};

const reinstatePreview: TenantLifecyclePreview = {
  ...suspendPreview,
  currentStatus: "suspended",
  targetStatus: "active",
};

function grantPermission() {
  (usePermissions as Mock).mockReturnValue({
    status: "ready",
    can: vi.fn((permission: string) => permission === Permission.COMPANY_SETTINGS_UPDATE),
    refreshPermissions: vi.fn(),
  });
}

function denyPermission() {
  (usePermissions as Mock).mockReturnValue({
    status: "ready",
    can: vi.fn(() => false),
    refreshPermissions: vi.fn(),
  });
}

describe("Company Detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grantPermission();
    (getTenantDetail as Mock).mockResolvedValue({ data: detail });
    (previewTenantSuspend as Mock).mockResolvedValue({ data: suspendPreview });
    (previewTenantReinstate as Mock).mockResolvedValue({ data: reinstatePreview });
    (suspendTenant as Mock).mockResolvedValue({ success: true, data: {} });
    (reinstateTenant as Mock).mockResolvedValue({ success: true, data: {} });
  });

  it("renders the company name as page title, slug as muted description, and a back link", async () => {
    render(<CompanyDetailPage />);
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Acme Corp");
    expect(heading.nextElementSibling?.textContent).toBe("acme-corp");
    const back = screen.getByRole("link");
    expect(back.getAttribute("href")).toBe("/super-admin/companies");
    expect(back.textContent).toContain("Companies");
  });

  it("renders the status pill reflecting the current status", async () => {
    render(<CompanyDetailPage />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getAllByText("active").length).toBeGreaterThan(0);
  });

  it("renders the Company Overview panel", async () => {
    render(<CompanyDetailPage />);
    expect(
      await screen.findByRole("heading", { name: "Company Overview" }),
    ).toBeTruthy();
  });

  it("uses the authoritative package name as the primary Plan value", async () => {
    render(<CompanyDetailPage />);
    await screen.findByRole("heading", { name: "Company Overview" });
    const firstDd = document.querySelector("dl dd");
    expect(firstDd?.textContent).toBe("Professional");
  });

  it("falls back to the legacy plan label when no package exists", async () => {
    (getTenantDetail as Mock).mockResolvedValue({
      data: { ...detail, package: null, subscription: null },
    });
    render(<CompanyDetailPage />);
    await screen.findByRole("heading", { name: "Company Overview" });
    const firstDd = document.querySelector("dl dd");
    expect(firstDd?.textContent).toBe("pro");
  });

  it("shows the People group with users, company admins, and employees", async () => {
    render(<CompanyDetailPage />);
    await screen.findByRole("heading", { name: "Company Overview" });
    const overview = screen
      .getByRole("heading", { name: "Company Overview" })
      .closest("section");
    const text = overview?.textContent ?? "";
    expect(text).toContain("2 active / 5 total");
    expect(text).toContain("Company Admins");
    expect(text).toContain("Employees");
  });

  it("shows the Usage group with documents, storage, and queries", async () => {
    render(<CompanyDetailPage />);
    await screen.findByRole("heading", { name: "Company Overview" });
    const overview = screen
      .getByRole("heading", { name: "Company Overview" })
      .closest("section");
    const text = overview?.textContent ?? "";
    expect(text).toContain("184");
    expect(text).toContain("2.5 GB");
    expect(text).toContain("6240");
  });

  it("shows the Record group with created and updated dates", async () => {
    render(<CompanyDetailPage />);
    await screen.findByRole("heading", { name: "Company Overview" });
    const overview = screen
      .getByRole("heading", { name: "Company Overview" })
      .closest("section");
    const text = overview?.textContent ?? "";
    expect(text).toContain(new Date(detail.createdAt).toLocaleDateString("en"));
    expect(text).toContain(new Date(detail.updatedAt).toLocaleDateString("en"));
  });

  it("renders the Subscription section and hides absent conditional fields", async () => {
    render(<CompanyDetailPage />);
    await screen.findByRole("heading", { name: "Subscription" });
    expect(screen.getByText("stripe")).toBeTruthy();
    expect(
      screen.getByText(new Date(detail.subscription!.periodStart!).toLocaleDateString("en")),
    ).toBeTruthy();
    expect(
      screen.getByText(new Date(detail.subscription!.periodEnd!).toLocaleDateString("en")),
    ).toBeTruthy();
    expect(screen.queryByText("Trial end:")).toBeNull();
  });

  it("renders the Package section with name, code · version, and entitlements", async () => {
    render(<CompanyDetailPage />);
    await screen.findByRole("heading", { name: "Package" });
    expect(screen.getAllByText("Professional").length).toBeGreaterThan(0);
    expect(screen.getByText(/^pro · v4$/)).toBeTruthy();
    const packageText = screen
      .getByRole("heading", { name: "Package" })
      .closest("section")?.textContent ?? "";
    expect(packageText).toContain("Max documents:");
    expect(packageText).toContain("1000");
    expect(packageText).toContain("5120 MB");
    expect(packageText).toContain("File size:");
    expect(packageText).toContain("100 MB");
    expect(packageText).toContain("6000");
  });

  it("renders recent activity as structured rows with quiet success and strong failure outcomes", async () => {
    render(<CompanyDetailPage />);
    await screen.findByRole("heading", { name: "Recent Activity" });
    expect(screen.getByText("TENANT.SUSPEND")).toBeTruthy();
    expect(screen.getByText("by ops@example.com")).toBeTruthy();
    const failureOutcome = screen.getByText("FAILURE");
    expect(failureOutcome.className).toContain("text-error");
    const successOutcome = screen.getByText("SUCCESS");
    expect(successOutcome.className).toContain("text-on-surface-variant");
  });

  it("shows the placeholder panel when neither subscription nor package exist", async () => {
    (getTenantDetail as Mock).mockResolvedValue({
      data: { ...detail, package: null, subscription: null },
    });
    render(<CompanyDetailPage />);
    await screen.findByText("No subscription or package configured for this tenant.");
  });

  it("opens the suspend dialog with title, description, and preview, then suspends with the reason", async () => {
    render(<CompanyDetailPage />);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Suspend company" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Suspend company" })).toBeTruthy();
    expect(dialog.textContent).toContain("may lose access");
    expect(dialog.textContent).toContain("Users affected:");
    expect(dialog.textContent).toContain("2 active / 5 total");
    expect(dialog.textContent).toContain("184");
    expect(dialog.textContent).toContain(
      "The company has an active subscription that will continue billing.",
    );

    const confirm = within(dialog).getByRole("button", { name: "Suspend company" });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.change(within(dialog).getByLabelText("Reason *"), {
      target: { value: "Policy violation" },
    });
    await waitFor(() =>
      expect(
        within(dialog)
          .getByRole("button", { name: "Suspend company" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend company" }));
    await waitFor(() =>
      expect(suspendTenant).toHaveBeenCalledWith("tenant-1", "Policy violation"),
    );
    await screen.findByText("Company suspended successfully.");
  });

  it("opens the reinstate dialog and calls reinstateTenant with the reason", async () => {
    (getTenantDetail as Mock).mockResolvedValue({
      data: { ...detail, status: "suspended" },
    });
    render(<CompanyDetailPage />);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Reinstate company" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Reinstate company" })).toBeTruthy();
    expect(dialog.textContent).toContain("restores access");

    await within(dialog).findByLabelText("Reason *");
    fireEvent.change(within(dialog).getByLabelText("Reason *"), {
      target: { value: "Investigation cleared" },
    });
    await waitFor(() =>
      expect(
        within(dialog)
          .getByRole("button", { name: "Reinstate company" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Reinstate company" }));
    await waitFor(() =>
      expect(reinstateTenant).toHaveBeenCalledWith("tenant-1", "Investigation cleared"),
    );
    await screen.findByText("Company reinstated successfully.");
  });

  it("hides the confirm action when the tenant is already in the target state", async () => {
    (previewTenantSuspend as Mock).mockResolvedValue({
      data: { ...suspendPreview, alreadyInTargetState: true },
    });
    render(<CompanyDetailPage />);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Suspend company" }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(
        within(dialog).queryByRole("button", { name: "Suspend company" }),
      ).toBeNull();
      expect(within(dialog).queryByLabelText("Reason *")).toBeNull();
    });
  });

  it("surfaces blocking reasons and hides the confirm action when transition is blocked", async () => {
    (previewTenantSuspend as Mock).mockResolvedValue({
      data: {
        ...suspendPreview,
        transitionAllowed: false,
        warnings: [],
        blockingReasons: ["This tenant cannot be suspended."],
      },
    });
    render(<CompanyDetailPage />);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Suspend company" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("This tenant cannot be suspended.");
    expect(
      within(dialog).queryByRole("button", { name: "Suspend company" }),
    ).toBeNull();
    expect(within(dialog).queryByLabelText("Reason *")).toBeNull();
  });

  it("shows a retryable error when the preview fails to load", async () => {
    (previewTenantSuspend as Mock).mockRejectedValue(new Error("network"));
    render(<CompanyDetailPage />);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Suspend company" }));

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Unable to load preview. Please try again.");
    expect(within(dialog).getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("hides lifecycle actions without the manage permission", async () => {
    denyPermission();
    render(<CompanyDetailPage />);
    await screen.findByRole("heading", { level: 1 });
    expect(
      screen.queryByRole("button", { name: "Suspend company" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Reinstate company" }),
    ).toBeNull();
  });
});
