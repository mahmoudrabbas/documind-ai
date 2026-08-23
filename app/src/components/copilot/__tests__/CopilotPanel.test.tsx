// @vitest-environment jsdom
/**
 * Regression test for the "Create a role" chip: clicking it must start the
 * roles.create guide through the real provider (`startGuide` →
 * `resolveGuideFlowApi` → guide machine running), not just invoke a mocked
 * handler. The provider internals are real; only the network/service layer and
 * unrelated hooks are mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useEffect } from "react";
import type { GuideFlowMeta, GuideSession } from "@/lib/copilot/copilot-types";
import type { GuideMachineState } from "@/lib/copilot/guide-machine";

const mocks = vi.hoisted(() => ({
  session: {
    sessionId: "guide-roles-1",
    flowId: "roles.create",
    locale: "en",
    dir: "ltr",
    entryRoute: "/dashboard/roles",
    steps: [
      {
        stepId: "step-1",
        order: 1,
        title: "Open Roles",
        instruction: "Click Roles in the sidebar to open the roles page.",
        target: { targetId: "nav-roles", route: "/dashboard/roles" },
        placement: "end",
        interaction: "navigate",
        completion: { event: "route_change", routeMatch: "/dashboard/roles" },
        fallback: { onMissing: "skip" },
      },
      {
        stepId: "step-2",
        order: 2,
        title: "Start creating",
        instruction: "Click the Create Role button to open the role form.",
        target: { targetId: "roles-create-button" },
        placement: "top",
        interaction: "click",
        completion: { event: "click" },
        fallback: { onMissing: "skip" },
      },
    ],
  } as GuideSession,
  flows: [
    {
      flowId: "roles.create",
      title: "Create a role",
      category: "roles",
      audience: "admin",
      keywords: [],
      available: true,
    },
    {
      flowId: "documents.upload",
      title: "Upload a document",
      category: "documents",
      audience: "employee",
      keywords: [],
      available: true,
    },
    {
      flowId: "documents.search",
      title: "Search documents",
      category: "documents",
      audience: "employee",
      keywords: [],
      available: true,
    },
  ] as GuideFlowMeta[],
  report: vi.fn<(probe: { guide: GuideMachineState | null; mode: string | null }) => void>(),
}));

vi.mock("@/services/copilot.service", () => ({
  getGuideFlows: vi.fn().mockResolvedValue(mocks.flows),
  resolveGuideFlow: vi.fn().mockResolvedValue(mocks.session),
  sendCopilotMessage: vi.fn().mockResolvedValue({ mode: "clarify" }),
  confirmAction: vi.fn(),
  createActionPlan: vi.fn().mockResolvedValue({ mode: "clarify" }),
  answerActionDraft: vi.fn(),
  cancelActionDraft: vi.fn(),
}));

vi.mock("@/hooks/features/useCopilotSocket", () => ({
  useCopilotSocket: () => {},
}));

vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({
    locale: "en",
    dir: "ltr",
    t: (key: string) => key,
    tPlural: () => "",
  }),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/providers/permission-provider", () => ({
  usePermissions: () => ({ can: () => true }),
}));

import { CopilotProvider, useCopilot } from "@/providers/copilot-provider";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import {
  getGuideFlows,
  resolveGuideFlow,
  sendCopilotMessage,
  createActionPlan,
} from "@/services/copilot.service";

function OpenPanelHarness() {
  const { setOpen } = useCopilot();
  useEffect(() => {
    setOpen(true);
  }, [setOpen]);
  return <CopilotPanel />;
}

function GuideProbe() {
  const { guide, mode } = useCopilot();
  mocks.report({ guide, mode });
  return null;
}

function lastProbe() {
  const last = mocks.report.mock.calls.at(-1);
  return last?.[0] ?? { guide: null, mode: null };
}

/** Types into the panel textarea and clicks the send button. */
function typeAndSend(text: string) {
  const textarea = container.querySelector(
    "textarea",
  ) as HTMLTextAreaElement | null;
  expect(textarea).toBeTruthy();
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(textarea, text);
    textarea?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const sendButton = container.querySelector(
    '[aria-label="copilot.panel.send"]',
  ) as HTMLButtonElement | null;
  expect(sendButton).toBeTruthy();
  act(() => {
    sendButton?.click();
  });
}

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.report.mockClear();
  vi.mocked(getGuideFlows).mockClear();
  vi.mocked(resolveGuideFlow).mockClear();
  vi.mocked(sendCopilotMessage).mockClear();
  vi.mocked(getGuideFlows).mockResolvedValue(mocks.flows);
  vi.mocked(sendCopilotMessage).mockResolvedValue({ mode: "clarify" });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe("CopilotPanel flow chips", () => {
  it("starts the roles.create guide when the Create a role chip is clicked", async () => {
    act(() => {
      root.render(
        <CopilotProvider>
          <OpenPanelHarness />
          <GuideProbe />
        </CopilotProvider>,
      );
    });

    // Let the open effect and loadFlows() settle so the catalog chips render.
    await act(async () => {});
    expect(getGuideFlows).toHaveBeenCalledTimes(1);

    const chip = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Create a role",
    );
    expect(chip).toBeTruthy();

    act(() => {
      chip?.click();
    });

    // Flush startGuide's awaited resolveGuideFlow + setSession/setMode.
    await act(async () => {});
    await act(async () => {});

    expect(resolveGuideFlow).toHaveBeenCalledWith({
      flowId: "roles.create",
      locale: "en",
    });
    const probe = lastProbe();
    expect(probe.guide).not.toBeNull();
    expect(probe.guide?.status).toBe("running");
    expect(probe.guide?.session.flowId).toBe("roles.create");
    expect(probe.guide?.currentIndex).toBe(0);
    expect(probe.mode).toBe("guide");
  });

  it("keeps the panel in launcher state until a chip is picked", async () => {
    act(() => {
      root.render(
        <CopilotProvider>
          <OpenPanelHarness />
          <GuideProbe />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    expect(getGuideFlows).toHaveBeenCalledTimes(1);
    expect(resolveGuideFlow).not.toHaveBeenCalled();
    const probe = lastProbe();
    expect(probe.guide).toBeNull();
    expect(probe.mode).toBeNull();
  });
});

describe("CopilotPanel capability_unavailable recommendations", () => {
  it("emphasizes the recommended roles.create flow, keeps other flows visible, and starts the guide without sending a message", async () => {
    vi.mocked(sendCopilotMessage).mockResolvedValueOnce({
      mode: "clarify",
      clarify: {
        kind: "capability_unavailable",
        message:
          "I can guide you through creating a role, but I can't create roles directly for you yet.",
        suggestedFlows: [
          "roles.create",
          "documents.upload",
          "documents.search",
        ],
        suggestedActions: [],
        recommendedFlowId: "roles.create",
      },
    });

    act(() => {
      root.render(
        <CopilotProvider>
          <OpenPanelHarness />
          <GuideProbe />
        </CopilotProvider>,
      );
    });
    await act(async () => {});
    expect(getGuideFlows).toHaveBeenCalledTimes(1);

    typeAndSend("Create HR Manager for me");
    await act(async () => {});
    await act(async () => {});

    expect(sendCopilotMessage).toHaveBeenCalledTimes(1);

    const buttons = Array.from(container.querySelectorAll("button"));
    const recommended = buttons.find(
      (button) =>
        button.querySelector(".material-symbols-outlined")?.textContent ===
        "arrow_forward",
    );
    expect(recommended).toBeTruthy();
    expect(recommended?.textContent).toContain("Create a role");
    expect(recommended?.className).toContain("bg-primary");
    expect(recommended?.className).toContain("w-full");

    // Every other suggested flow stays visible.
    expect(container.textContent).toContain("Upload a document");
    expect(container.textContent).toContain("Search documents");

    // The recommended CTA is rendered above the generic flow chips.
    const uploadChip = buttons.find(
      (button) => button.textContent?.trim() === "Upload a document",
    );
    expect(uploadChip).toBeTruthy();
    expect(
      recommended!.compareDocumentPosition(uploadChip!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Clicking it starts the roles.create guide — it must NOT send another
    // normal Copilot message.
    act(() => {
      recommended?.click();
    });
    await act(async () => {});
    await act(async () => {});

    expect(sendCopilotMessage).toHaveBeenCalledTimes(1);
    expect(resolveGuideFlow).toHaveBeenCalledWith({
      flowId: "roles.create",
      locale: "en",
    });
    const probe = lastProbe();
    expect(probe.mode).toBe("guide");
    expect(probe.guide?.session.flowId).toBe("roles.create");
  });

  it("keeps the generic clarify rendering unchanged when no flow is recommended", async () => {
    vi.mocked(sendCopilotMessage).mockResolvedValueOnce({
      mode: "clarify",
      clarify: {
        kind: "generic",
        message: "Could you clarify?",
        suggestedFlows: ["documents.upload"],
        suggestedActions: ["document.search"],
      },
    });

    act(() => {
      root.render(
        <CopilotProvider>
          <OpenPanelHarness />
          <GuideProbe />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    typeAndSend("help");
    await act(async () => {});
    await act(async () => {});

    // No recommendation section is rendered.
    const arrow = Array.from(
      container.querySelectorAll(".material-symbols-outlined"),
    ).find((icon) => icon.textContent === "arrow_forward");
    expect(arrow).toBeUndefined();

    // Generic heading + flow/action chips render exactly as before.
    expect(container.textContent).toContain("copilot.clarify.flowsHeading");
    expect(container.textContent).toContain("Upload a document");
    expect(container.textContent).toContain("document.search");
    expect(resolveGuideFlow).not.toHaveBeenCalled();
  });
});

describe("CopilotPanel mode tabs", () => {
  it("renders the segmented Guides / Actions tab switcher", async () => {
    act(() => {
      root.render(
        <CopilotProvider>
          <OpenPanelHarness />
          <GuideProbe />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    expect(container.textContent).toContain("copilot.tabs.guides");
    expect(container.textContent).toContain("copilot.tabs.actions");
  });

  it("shows flow catalog on the Guides tab and action chips on the Actions tab", async () => {
    act(() => {
      root.render(
        <CopilotProvider>
          <OpenPanelHarness />
          <GuideProbe />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    // Default view is guide — flows are visible, action chips are not.
    expect(container.textContent).toContain("Create a role");
    expect(container.textContent).toContain("copilot.panel.placeholder");

    // Switch to the Actions tab.
    const actionsTab = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("copilot.tabs.actions"),
    );
    expect(actionsTab).toBeTruthy();
    act(() => {
      actionsTab?.click();
    });

    // Now action chips should be visible, flows hidden.
    expect(container.textContent).toContain("copilot.actions.title");
    expect(container.textContent).toContain("copilot.actions.subtitle");
    expect(container.textContent).toContain("copilot.action.chip.user.invite");
  });

  it("auto-switches to the Actions tab when an action starts", async () => {
    // Start on guide tab, then send a message that results in action mode.
    vi.mocked(sendCopilotMessage).mockResolvedValueOnce({
      mode: "action",
      actionPlan: {
        runId: "run-1",
        intent: "search contracts",
        toolName: "document.search",
        risk: "low",
        requiresConfirmation: false,
        summary: "Search documents",
        target: null,
      },
    });

    act(() => {
      root.render(
        <CopilotProvider>
          <OpenPanelHarness />
          <GuideProbe />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    typeAndSend("search contracts");
    await act(async () => {});
    await act(async () => {});
    await act(async () => {});

    const probe = lastProbe();
    expect(probe.mode).toBe("action");
    // The view should have auto-switched to action (actions tab content visible).
    expect(container.textContent).toContain("copilot.tabs.actions");
  });

  it("error in runAction keeps chips visible instead of hiding them", async () => {
    // Mock createActionPlan to throw — simulates a failed chip click.
    vi.mocked(createActionPlan).mockRejectedValueOnce(
      new Error("AGENT_HANDOFF_INVALID"),
    );

    act(() => {
      root.render(
        <CopilotProvider>
          <OpenPanelHarness />
          <GuideProbe />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    // Switch to Actions tab.
    const actionsTab = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("copilot.tabs.actions"),
    );
    act(() => {
      actionsTab?.click();
    });
    await act(async () => {});

    // Click an action chip.
    const chip = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("copilot.action.chip.user.invite"),
    );
    expect(chip).toBeTruthy();
    act(() => {
      chip?.click();
    });
    await act(async () => {});
    await act(async () => {});
    await act(async () => {});

    // Error is shown but the panel stays in launcher with chips visible.
    expect(container.textContent).toContain("AGENT_HANDOFF_INVALID");
    expect(container.textContent).toContain("copilot.actions.title");
    expect(container.textContent).toContain("copilot.action.chip.user.invite");
  });

  it("surfaces the inline result when a chip action executes directly", async () => {
    vi.mocked(createActionPlan).mockResolvedValueOnce({
      mode: "action",
      actionPlan: {
        runId: "run-user-list-1",
        intent: "List users",
        toolName: "user.list",
        risk: "low",
        requiresConfirmation: false,
        summary: "List users",
        target: null,
      },
      result: {
        runId: "run-user-list-1",
        status: "completed",
        toolName: "user.list",
        output: { users: [{ email: "sara@company.com" }] },
        message: "Found 1 user",
      },
    });

    act(() => {
      root.render(
        <CopilotProvider>
          <OpenPanelHarness />
          <GuideProbe />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    const actionsTab = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("copilot.tabs.actions"),
    );
    act(() => {
      actionsTab?.click();
    });
    await act(async () => {});

    const chip = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("copilot.action.chip.user.list"),
    );
    expect(chip).toBeTruthy();
    act(() => {
      chip?.click();
    });
    await act(async () => {});
    await act(async () => {});
    await act(async () => {});

    // The result card must render instead of a bare plan card.
    expect(container.textContent).toContain("copilot.action.result.succeeded");
    expect(container.textContent).toContain("Found 1 user");
  });
});

describe("CopilotPanel sidebar section chips", () => {
  it("opens straight onto the Actions tab showing only the section's chips", async () => {
    act(() => {
      root.render(
        <CopilotProvider>
          <SectionActionsHarness tools={["user.invite", "user.list"]} />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    // Auto-switched to the Actions tab with the section's quick guides only.
    expect(container.textContent).toContain("copilot.tabs.actions");
    expect(container.textContent).toContain("copilot.actions.title");
    expect(container.textContent).toContain("copilot.action.chip.user.invite");
    expect(container.textContent).toContain("copilot.action.chip.user.list");
    expect(container.textContent).not.toContain(
      "copilot.action.chip.document.search",
    );
  });

  it("opens onto the Guides tab showing only the section's flow chips", async () => {
    act(() => {
      root.render(
        <CopilotProvider>
          <SectionFlowsHarness flows={["roles.create"]} />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    // Auto-switched to the Guides tab with the section's flow chips only.
    expect(container.textContent).toContain("copilot.tabs.guides");
    expect(container.textContent).toContain("Create a role");
    expect(container.textContent).not.toContain("Upload a document");
    expect(container.textContent).not.toContain("Search documents");
    // Action chips are not on screen either.
    expect(container.textContent).not.toContain("copilot.actions.title");
  });

  it("restores the full catalog after the panel is closed and reopened", async () => {
    act(() => {
      root.render(
        <CopilotProvider>
          <OpenCloseHarness />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    // Sidebar-driven open: filtered chips.
    act(() => {
      (container.querySelector('[data-testid="open-section"]') as HTMLElement)?.click();
    });
    await act(async () => {});
    expect(container.textContent).toContain("copilot.action.chip.user.invite");
    expect(container.textContent).not.toContain(
      "copilot.action.chip.document.search",
    );

    // Launcher-style reopen: the section filter is gone.
    act(() => {
      (container.querySelector('[data-testid="close-panel"]') as HTMLElement)?.click();
    });
    await act(async () => {});
    act(() => {
      (container.querySelector('[data-testid="open-launcher"]') as HTMLElement)?.click();
    });
    await act(async () => {});

    const actionsTab = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("copilot.tabs.actions"),
    );
    act(() => {
      actionsTab?.click();
    });
    await act(async () => {});

    expect(container.textContent).toContain("copilot.action.chip.user.invite");
    expect(container.textContent).toContain(
      "copilot.action.chip.document.search",
    );
  });
});

function SectionActionsHarness({ tools }: { tools: string[] }) {
  const { openSection } = useCopilot();
  useEffect(() => {
    openSection({ tools, flows: [] });
  }, [openSection, tools]);
  return <CopilotPanel />;
}

function SectionFlowsHarness({ flows }: { flows: string[] }) {
  const { openSection } = useCopilot();
  useEffect(() => {
    openSection({ tools: [], flows });
  }, [openSection, flows]);
  return <CopilotPanel />;
}

function OpenCloseHarness() {
  const { openSection, setOpen } = useCopilot();
  return (
    <>
      <button
        type="button"
        data-testid="open-section"
        onClick={() => openSection({ tools: ["user.invite"], flows: [] })}
      >
        open section
      </button>
      <button type="button" data-testid="close-panel" onClick={() => setOpen(false)}>
        close
      </button>
      <button type="button" data-testid="open-launcher" onClick={() => setOpen(true)}>
        launcher
      </button>
      <CopilotPanel />
    </>
  );
}