// @vitest-environment jsdom
/**
 * Interactive action-input flow (guider.md §16): when the assistant opens a
 * draft (mode "action_input"), the panel renders the Q&A transcript and an
 * answerable question card. Answers run through the real provider
 * (`answerDraft` → `answerActionDraft`), and a completed draft runs the action
 * end-to-end through the action lifecycle.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useEffect } from "react";
import type {
  ActionDraft,
  ActionPlan,
  ActionResult,
} from "@/lib/copilot/copilot-types";

const mocks = vi.hoisted(() => ({
  draft: {
    draftId: "draft-1",
    toolName: "user.invite",
    summary: "invite a new user",
    answered: [],
    question: {
      field: "name",
      type: "text",
      labelKey: "copilot.action.input.field.user.invite.name",
      label: "What is the new user's full name?",
    },
    questionsRemaining: 1,
  } as ActionDraft,
  nextDraft: {
    draftId: "draft-1",
    toolName: "user.invite",
    summary: "invite a new user",
    answered: [{ field: "name", value: "Sara Ali" }],
    question: {
      field: "email",
      type: "email",
      labelKey: "copilot.action.input.field.user.invite.email",
      label: "What is the new user's email address?",
    },
    questionsRemaining: 1,
  } as ActionDraft,
  failedDraft: {
    draftId: "draft-1",
    toolName: "user.invite",
    summary: "invite a new user",
    answered: [],
    question: {
      field: "name",
      type: "text",
      labelKey: "copilot.action.input.field.user.invite.name",
      label: "What is the new user's full name?",
    },
    questionsRemaining: 1,
    message: "I couldn't find a matching document or user.",
  } as ActionDraft,
  result: {
    runId: "run-1",
    status: "completed",
    toolName: "user.invite",
    output: {
      user: {
        id: "u-1",
        name: "Sara Ali",
        email: "sara@company.com",
      },
    },
    message: "Sara Ali was invited",
  } as ActionResult,
  plan: {
    runId: "run-1",
    intent: "invite a new user",
    toolName: "document.softDelete",
    risk: "destructive",
    requiresConfirmation: true,
    summary: "Move document to trash",
    target: null,
    approvalId: "approval-1",
  } as ActionPlan,
  report: vi.fn<
    (probe: {
      mode: string | null;
      draft: ActionDraft | null;
      transcript: { role: "user" | "assistant"; text: string }[];
    }) => void
  >(),
}));

vi.mock("@/services/copilot.service", () => ({
  getGuideFlows: vi.fn().mockResolvedValue([]),
  resolveGuideFlow: vi.fn(),
  sendCopilotMessage: vi.fn(),
  confirmAction: vi.fn(),
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
  answerActionDraft,
  cancelActionDraft,
  confirmAction,
  sendCopilotMessage,
} from "@/services/copilot.service";

function OpenPanelHarness() {
  const { setOpen } = useCopilot();
  useEffect(() => {
    setOpen(true);
  }, [setOpen]);
  return <CopilotPanel />;
}

function Probe() {
  const { mode, draft, transcript } = useCopilot();
  mocks.report({ mode, draft, transcript });
  return null;
}

function lastProbe() {
  const last = mocks.report.mock.calls.at(-1);
  return (
    last?.[0] ?? { mode: null, draft: null, transcript: [] }
  );
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
  vi.mocked(sendCopilotMessage).mockClear();
  vi.mocked(answerActionDraft).mockClear();
  vi.mocked(cancelActionDraft).mockClear();
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe("CopilotPanel interactive action input", () => {
  it("renders the Q&A transcript and question card when a draft opens", async () => {
    vi.mocked(sendCopilotMessage).mockResolvedValueOnce({
      mode: "action_input",
      actionDraft: mocks.draft,
    });

    act(() => {
      root.render(
        <CopilotProvider>
          <OpenPanelHarness />
          <Probe />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    typeAndSend("invite a new user");
    await act(async () => {});
    await act(async () => {});

    expect(lastProbe().mode).toBe("action_input");
    expect(lastProbe().draft?.draftId).toBe("draft-1");

    // User utterance bubble + assistant question bubble.
    const bubbles = Array.from(
      container.querySelectorAll(".rounded-2xl"),
    ).map((bubble) => bubble.textContent?.trim());
    expect(bubbles).toContain("invite a new user");
    expect(bubbles).toContain("What is the new user's full name?");

    // The question card shows the server label and a cancel affordance; the
    // footer input invites an answer (no enum options → free text).
    expect(container.textContent).toContain("What is the new user's full name?");
    expect(container.textContent).toContain("copilot.action.cancel");
    expect(
      container.querySelector("textarea")?.getAttribute("placeholder"),
    ).toBe("copilot.action.input.placeholder");
  });

  it("forwards an answer to the draft and advances to the next question", async () => {
    vi.mocked(sendCopilotMessage).mockResolvedValueOnce({
      mode: "action_input",
      actionDraft: mocks.draft,
    });
    vi.mocked(answerActionDraft).mockResolvedValueOnce({
      completed: false,
      draft: mocks.nextDraft,
    });

    act(() => {
      root.render(
        <CopilotProvider>
          <OpenPanelHarness />
          <Probe />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    typeAndSend("invite a new user");
    await act(async () => {});
    await act(async () => {});

    typeAndSend("Sara Ali");
    await act(async () => {});
    await act(async () => {});

    expect(answerActionDraft).toHaveBeenCalledWith("draft-1", "Sara Ali");
    expect(lastProbe().mode).toBe("action_input");
    expect(lastProbe().draft?.question?.field).toBe("email");

    // The user answer and the next question appear as bubbles.
    const text = container.textContent ?? "";
    expect(text).toContain("Sara Ali");
    expect(text).toContain("What is the new user's email address?");
  });

  it("bubbles the server message when an answer cannot be used, without repeating the question", async () => {
    vi.mocked(sendCopilotMessage).mockResolvedValueOnce({
      mode: "action_input",
      actionDraft: mocks.draft,
    });
    vi.mocked(answerActionDraft).mockResolvedValueOnce({
      completed: false,
      draft: mocks.failedDraft,
    });

    act(() => {
      root.render(
        <CopilotProvider>
          <OpenPanelHarness />
          <Probe />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    typeAndSend("invite a new user");
    await act(async () => {});
    await act(async () => {});

    typeAndSend("rules");
    await act(async () => {});
    await act(async () => {});

    expect(answerActionDraft).toHaveBeenCalledWith("draft-1", "rules");
    expect(lastProbe().mode).toBe("action_input");
    expect(lastProbe().draft?.message).toBe(
      "I couldn't find a matching document or user.",
    );

    const text = container.textContent ?? "";
    // The failure reason is shown once (the transcript bubble).
    expect(text).toContain("I couldn't find a matching document or user.");
    // The question still lives in the question card, but must not be re-bubbled.
    const bubbles = Array.from(
      container.querySelectorAll(".rounded-2xl"),
    ).map((bubble) => bubble.textContent?.trim());
    expect(
      bubbles.filter((bubble) => bubble === "What is the new user's full name?")
        .length,
    ).toBe(1);
  });

  it("completes the draft, runs the action, and surfaces the result", async () => {
    vi.mocked(sendCopilotMessage).mockResolvedValueOnce({
      mode: "action_input",
      actionDraft: mocks.draft,
    });
    vi.mocked(answerActionDraft).mockResolvedValueOnce({
      completed: true,
      outcome: { plan: mocks.plan, result: mocks.result },
    });

    act(() => {
      root.render(
        <CopilotProvider>
          <OpenPanelHarness />
          <Probe />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    typeAndSend("invite a new user");
    await act(async () => {});
    await act(async () => {});

    typeAndSend("Sara Ali");
    await act(async () => {});
    await act(async () => {});

    expect(answerActionDraft).toHaveBeenCalledWith("draft-1", "Sara Ali");
    expect(lastProbe().mode).toBe("action");
    expect(lastProbe().draft).toBeNull();

    // The result message lands as a transcript bubble.
    expect(container.textContent).toContain("Sara Ali was invited");
  });

  it("abandons the draft when cancel is clicked", async () => {
    vi.mocked(sendCopilotMessage).mockResolvedValueOnce({
      mode: "action_input",
      actionDraft: mocks.draft,
    });

    act(() => {
      root.render(
        <CopilotProvider>
          <OpenPanelHarness />
          <Probe />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    typeAndSend("invite a new user");
    await act(async () => {});
    await act(async () => {});

    const cancelButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "copilot.action.cancel",
    );
    expect(cancelButton).toBeTruthy();

    act(() => {
      cancelButton?.click();
    });
    await act(async () => {});

    expect(cancelActionDraft).toHaveBeenCalledWith("draft-1");
    const probe = lastProbe();
    expect(probe.mode).toBeNull();
    expect(probe.draft).toBeNull();
    expect(probe.transcript).toEqual([]);
  });

  it("surfaces the run's real error message when confirmation fails", async () => {
    vi.mocked(sendCopilotMessage).mockResolvedValueOnce({
      mode: "action_input",
      actionDraft: mocks.draft,
    });
    vi.mocked(answerActionDraft).mockResolvedValueOnce({
      completed: true,
      outcome: { plan: mocks.plan },
    });
    vi.mocked(confirmAction).mockResolvedValueOnce({
      status: "failed",
      run: {
        status: "failed",
        error: {
          code: "RUN_FAILED",
          message: "Document must be soft-deleted first",
        },
      },
    });

    act(() => {
      root.render(
        <CopilotProvider>
          <OpenPanelHarness />
          <Probe />
        </CopilotProvider>,
      );
    });
    await act(async () => {});

    typeAndSend("invite a new user");
    await act(async () => {});
    await act(async () => {});
    typeAndSend("Sara Ali");
    await act(async () => {});
    await act(async () => {});

    // Destructive plan → double-confirm: approve twice.
    const approveButtons = () =>
      Array.from(container.querySelectorAll("button")).filter((button) =>
        button.textContent?.trim().startsWith("copilot.action.plan.approve"),
      );
    act(() => {
      approveButtons()[0]?.click();
    });
    await act(async () => {});
    act(() => {
      approveButtons()[0]?.click();
    });
    await act(async () => {});

    expect(confirmAction).toHaveBeenCalledWith({
      runId: "run-1",
      decision: "approve",
      approvalId: "approval-1",
      note: undefined,
      locale: "en",
    });

    // The card shows the backend's failure reason, not a generic label.
    expect(container.textContent).toContain(
      "Document must be soft-deleted first",
    );
    expect(container.textContent).not.toContain("Action failed");
  });
});
