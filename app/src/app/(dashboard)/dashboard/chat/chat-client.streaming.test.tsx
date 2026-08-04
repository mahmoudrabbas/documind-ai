// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, beforeAll, type Mock } from "vitest";
import { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { ChatSource } from "@/types/api/chat.types";

/* ── Module mocks (hoisted by vitest) ─────────────────────────────────── */

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/services/chat.service", () => ({
  streamChat: vi.fn(),
  listConversations: vi.fn(),
  getConversationMessages: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock("@/providers/i18n-provider", () => {
  // Real translation map: t("chat.thinking") must resolve to the English
  // string asserted below — NOT a bare key-returning mock (that would render
  // "chat.thinking" and fail the assertion).
  const translations: Record<string, string> = {
    "chat.thinking": "DocuMind is thinking...",
    "entitlement.denial.quotaTitle": "You've reached your {{dimension}} limit",
    "entitlement.denial.quotaDescription":
      "Upgrade your plan to continue using DocuMind AI.",
  };
  return {
    useI18n: () => ({
      locale: "en",
      dir: "ltr",
      t: (key: string, params?: Record<string, string>): string => {
        let value = translations[key] ?? key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            value = value.split(`{{${k}}}`).join(v);
          }
        }
        return value;
      },
    }),
  };
});

vi.mock("@/providers/permission-provider", () => ({
  usePermissions: () => ({
    status: "ready",
    can: vi.fn(() => true),
    refreshPermissions: vi.fn(),
  }),
}));

vi.mock("@/components/documents/PdfViewerModal", () => ({
  PdfViewerModal: () => null,
}));

vi.mock("@/components/domain/FeedbackWidget", () => ({
  FeedbackWidget: () => null,
}));

/* ── Imports (resolved after hoisted mocks) ───────────────────────────── */

import { ChatClient } from "./chat-client";
import { streamChat, listConversations } from "@/services/chat.service";
import { ApiError } from "@/lib/api-client";

/* ── Helpers ─────────────────────────────────────────────────────────── */

type StreamCallbacks = {
  onToken: (content: string) => void;
  onSources: (sources: ChatSource[]) => void;
  onDone: (payload: { messageId: string; conversationId: string }) => void;
};

const SOURCE: ChatSource = {
  chunkId: "c1",
  documentId: "d1",
  text: "x",
  score: 0.9,
  documentTitle: "Doc",
};

/** Controllable streamChat mock: captures callbacks, resolves on finish(). */
function setupStreamChat() {
  let captured: StreamCallbacks | null = null;
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  (streamChat as Mock).mockImplementation(
    (_input: unknown, callbacks: StreamCallbacks) => {
      captured = callbacks;
      return promise;
    },
  );
  return {
    callbacks: () => captured!,
    finish: () => resolvePromise(),
  };
}

function renderChat() {
  return render(<ChatClient />);
}

async function askQuestion(question: string) {
  const user = userEvent.setup();
  await user.type(
    screen.getByPlaceholderText("Ask about your documents..."),
    question,
  );
  await user.keyboard("{Enter}");
}

/* ── Tests ───────────────────────────────────────────────────────────── */

describe("ChatClient streaming", () => {
  beforeAll(() => {
    // jsdom does not implement scrollIntoView; the chat view scrolls on every
    // message/isTyping change.
    if (
      typeof Element !== "undefined" &&
      !Element.prototype.scrollIntoView
    ) {
      Element.prototype.scrollIntoView = (() => {}) as any;
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (listConversations as Mock).mockResolvedValue({
      conversations: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });

  it("streams tokens into the assistant bubble, shows the thinking indicator while streaming, and renders sources after done", async () => {
    const stream = setupStreamChat();
    renderChat();

    await askQuestion("What is the holiday schedule for 2026?");

    // Optimistic user bubble appears immediately.
    expect(
      await screen.findByText("What is the holiday schedule for 2026?"),
    ).toBeInTheDocument();

    // Thinking indicator visible during the pre-first-token wait.
    expect(screen.getByText("DocuMind is thinking...")).toBeInTheDocument();

    const cbs = stream.callbacks();

    // Tokens arrive → placeholder bubble grows; indicator yields to content.
    await act(async () => {
      cbs.onToken("Hel");
      cbs.onToken("lo");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.queryByText("DocuMind is thinking...")).not.toBeInTheDocument();

    // Sources + done → placeholder replaced by the real message with sources.
    await act(async () => {
      cbs.onSources([SOURCE]);
      cbs.onDone({ messageId: "m1", conversationId: "c1" });
      stream.finish();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() =>
      expect(screen.queryByText("DocuMind is thinking...")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Sources")).toBeInTheDocument();
    expect(screen.getByText("Doc")).toBeInTheDocument();
  });

  it("shows the UpgradePrompt banner and removes the placeholder when streamChat rejects with an entitlement error", async () => {
    (streamChat as Mock).mockRejectedValue(
      new ApiError({
        status: 429,
        code: "ENTITLEMENT_EXCEEDED",
        message: "quota",
        retryAfterSeconds: 30,
      }),
    );

    const { container } = renderChat();
    await askQuestion("What is the remote work policy?");

    // mapEntitlementError path → quota-exceeded UpgradePrompt banner.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText("You've reached your Quota limit"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade" })).toBeInTheDocument();

    // Placeholder removed: no assistant bubble / indicator left in the thread
    // (the only remaining bubble is the optimistic user message, bg-primary).
    await waitFor(() =>
      expect(screen.queryByText("DocuMind is thinking...")).not.toBeInTheDocument(),
    );
    expect(container.querySelectorAll(".bg-surface-container").length).toBe(0);
  });

  it("registers a brand-new conversation in the sidebar when no conversation was active", async () => {
    const stream = setupStreamChat();
    renderChat();

    const question = "What is the office closing policy?";
    await askQuestion(question);

    await screen.findByText(question);
    const cbs = stream.callbacks();

    await act(async () => {
      cbs.onToken("Hel");
      cbs.onToken("lo");
      cbs.onSources([SOURCE]);
      cbs.onDone({ messageId: "m1", conversationId: "c1" });
      stream.finish();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Sidebar gains a conversation titled with the question (rendered once in
    // the sidebar list, once as the user bubble) and the assistant answer is
    // rendered because activeConversation switched to the real conversationId.
    const questionMatches = await screen.findAllByText(question);
    expect(questionMatches.length).toBeGreaterThanOrEqual(2);
    // "Hello" appears in the assistant bubble and as the sidebar lastMessage.
    const answerMatches = await screen.findAllByText("Hello");
    expect(answerMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Sources")).toBeInTheDocument();
  });
});
