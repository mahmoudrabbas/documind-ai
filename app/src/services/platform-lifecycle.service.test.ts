import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getTenantDetail,
  previewTenantSuspend,
  previewTenantReinstate,
  suspendTenant,
  reinstateTenant,
} from "./platform.service";
import { parseTenantListQuery } from "./platform.service";
import {
  canConfirmTenantLifecycle,
  completeTenantLifecycleTransition,
  createLifecyclePreviewRequestTracker,
  lifecyclePreviewRequestKey,
} from "@/lib/tenant-lifecycle-state";

const mockApiClient = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
}));

beforeEach(() => {
  mockApiClient.mockReset();
});

describe("tenant detail service", () => {
  it("calls the correct route for tenant detail", async () => {
    const mockData = {
      id: "abc123",
      name: "Acme Corp",
      slug: "acme-corp",
      status: "active",
      plan: "free",
      isSystemTenant: false,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
      users: { total: 5, active: 3, companyAdmins: 1, employees: 2 },
      package: null,
      subscription: null,
      usage: { documents: 10, storageBytes: 1024, questions: 50 },
      recentAudit: [],
    };
    mockApiClient.mockResolvedValue({ success: true, data: mockData });
    const result = await getTenantDetail("abc123");
    expect(mockApiClient).toHaveBeenCalledWith(
      "/platform/tenants/abc123/detail",
      { signal: undefined },
    );
    expect(result.data.id).toBe("abc123");
    expect(result.data.name).toBe("Acme Corp");
  });

  it("passes abort signal through", async () => {
    mockApiClient.mockResolvedValue({ success: true, data: {} });
    const controller = new AbortController();
    await getTenantDetail("abc123", controller.signal);
    expect(mockApiClient).toHaveBeenCalledWith(
      "/platform/tenants/abc123/detail",
      { signal: controller.signal },
    );
  });
});

describe("tenant lifecycle list state", () => {
  it("accepts suspended as a tenant list filter", () => {
    expect(
      parseTenantListQuery(new URLSearchParams("status=suspended"))
        .status,
    ).toBe("suspended");
  });
});

describe("suspend preview service", () => {
  it("calls the correct route for suspend preview", async () => {
    const mockPreview = {
      tenantId: "abc123",
      tenantName: "Acme",
      currentStatus: "active",
      targetStatus: "suspended",
      transitionAllowed: true,
      totalUsersAffected: 5,
      activeUsersAffected: 3,
      activeCompanyAdminsAffected: 1,
      currentSubscriptionStatus: "active",
      documentCount: 10,
      warnings: ["User access will be blocked"],
      blockingReasons: [],
    };
    mockApiClient.mockResolvedValue({ success: true, data: mockPreview });
    const result = await previewTenantSuspend("abc123");
    expect(mockApiClient).toHaveBeenCalledWith(
      "/platform/tenants/abc123/preview/suspend",
      { signal: undefined },
    );
    expect(result.data.transitionAllowed).toBe(true);
    expect(result.data.targetStatus).toBe("suspended");
  });
});

describe("reinstate preview service", () => {
  it("calls the correct route for reinstate preview", async () => {
    const mockPreview = {
      tenantId: "abc123",
      tenantName: "Acme",
      currentStatus: "suspended",
      targetStatus: "active",
      transitionAllowed: true,
      totalUsersAffected: 5,
      activeUsersAffected: 0,
      activeCompanyAdminsAffected: 1,
      currentSubscriptionStatus: "active",
      documentCount: 10,
      warnings: ["User access will be restored"],
      blockingReasons: [],
    };
    mockApiClient.mockResolvedValue({ success: true, data: mockPreview });
    const result = await previewTenantReinstate("abc123");
    expect(mockApiClient).toHaveBeenCalledWith(
      "/platform/tenants/abc123/preview/reinstate",
      { signal: undefined },
    );
    expect(result.data.targetStatus).toBe("active");
  });
});

describe("suspend tenant service", () => {
  it("sends the validated reason via POST", async () => {
    const mockResult = {
      id: "abc123",
      name: "Acme",
      slug: "acme",
      status: "suspended",
      plan: "free",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    };
    mockApiClient.mockResolvedValue({ success: true, data: mockResult });
    const result = await suspendTenant("abc123", "Policy violation investigation");
    expect(mockApiClient).toHaveBeenCalledWith(
      "/platform/tenants/abc123/suspend",
      {
        method: "POST",
        body: { reason: "Policy violation investigation" },
      },
    );
    expect(result.data.status).toBe("suspended");
  });
});

describe("reinstate tenant service", () => {
  it("sends the validated reason via POST", async () => {
    const mockResult = {
      id: "abc123",
      name: "Acme",
      slug: "acme",
      status: "active",
      plan: "free",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    };
    mockApiClient.mockResolvedValue({ success: true, data: mockResult });
    const result = await reinstateTenant("abc123", "Investigation cleared");
    expect(mockApiClient).toHaveBeenCalledWith(
      "/platform/tenants/abc123/reinstate",
      {
        method: "POST",
        body: { reason: "Investigation cleared" },
      },
    );
    expect(result.data.status).toBe("active");
  });
});

describe("tenant lifecycle type contracts", () => {
  it("getTenantDetail exports a function", () => {
    expect(typeof getTenantDetail).toBe("function");
  });

  it("previewTenantSuspend exports a function", () => {
    expect(typeof previewTenantSuspend).toBe("function");
  });

  it("previewTenantReinstate exports a function", () => {
    expect(typeof previewTenantReinstate).toBe("function");
  });

  it("suspendTenant exports a function", () => {
    expect(typeof suspendTenant).toBe("function");
  });

  it("reinstateTenant exports a function", () => {
    expect(typeof reinstateTenant).toBe("function");
  });
});

describe("tenant lifecycle dialog state", () => {
  const allowedPreview = {
    tenantId: "abc123",
    tenantName: "Acme",
    currentStatus: "active" as const,
    targetStatus: "suspended" as const,
    transitionAllowed: true,
    alreadyInTargetState: false,
    totalUsersAffected: 5,
    activeUsersAffected: 3,
    activeCompanyAdminsAffected: 1,
    currentSubscriptionStatus: "active",
    documentCount: 10,
    warnings: [],
    blockingReasons: [],
  };

  it("blocks confirmation when the preview blocks the transition", () => {
    expect(
      canConfirmTenantLifecycle(
        { ...allowedPreview, transitionAllowed: false },
        "Valid reason",
        false,
      ),
    ).toBe(false);
  });

  it("requires a trimmed 3 to 500 character reason", () => {
    expect(canConfirmTenantLifecycle(allowedPreview, "  ok  ", false)).toBe(false);
    expect(canConfirmTenantLifecycle(allowedPreview, "  valid reason  ", false)).toBe(true);
    expect(canConfirmTenantLifecycle(allowedPreview, "x".repeat(501), false)).toBe(false);
  });

  it("reloads completed transition state before closing", () => {
    const calls: string[] = [];
    completeTenantLifecycleTransition(
      () => calls.push("reload"),
      () => calls.push("close"),
    );
    expect(calls).toEqual(["reload", "close"]);
  });

  it("does not start another preview request for rerenders of the same dialog", () => {
    const tracker = createLifecyclePreviewRequestTracker();
    const suspendKey = lifecyclePreviewRequestKey("abc123", "suspended");

    expect(tracker.start(suspendKey)).toBe(true);
    expect(tracker.start(suspendKey)).toBe(false);
    tracker.complete(suspendKey);
    expect(tracker.start(suspendKey)).toBe(false);

    tracker.reset(suspendKey);
    expect(tracker.start(suspendKey)).toBe(true);
    tracker.complete(suspendKey);

    const reinstateKey = lifecyclePreviewRequestKey("abc123", "active");
    expect(tracker.start(reinstateKey)).toBe(true);
  });
});
