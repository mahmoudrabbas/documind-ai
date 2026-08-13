import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("chat history drawer (mobile)", () => {
  it("reuses a single ConversationPanel for sidebar and drawer", async () => {
    const source = await readFile(
      new URL("./chat-client.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("function ConversationPanel");
    expect(source.match(/<ConversationPanel\b/g)).toHaveLength(2);
    // Sidebar + drawer share the same rendering so lists never drift apart.
    expect(source).toContain('className="hidden w-56 shrink-0 flex-col');
    expect(source).toContain("lg:w-64 xl:w-72");
    expect(source).toContain('data-testid="chat-history-drawer"');
  });

  it("is an overlay drawer (not the global navigation drawer)", async () => {
    const source = await readFile(
      new URL("./chat-client.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('data-testid="chat-history-backdrop"');
    expect(source).toContain("fixed inset-y-0 start-0 z-[60]");
    expect(source).toContain("role=\"dialog\"");
    expect(source).toContain("aria-modal=\"true\"");
    expect(source).toContain("md:hidden");
  });

  it("adds a mobile-only toggle that opens the history drawer", async () => {
    const source = await readFile(
      new URL("./chat-client.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('data-testid="chat-mobile-history-toggle"');
    expect(source).toContain("setHistoryOpen(true)");
    expect(source).toContain("md:hidden");
  });

  it("closes the drawer on Escape and locks body scroll while open", async () => {
    const source = await readFile(
      new URL("./chat-client.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      'if (event.key === "Escape") setHistoryOpen(false);',
    );
    expect(source).toContain("document.body.style.overflow = \"hidden\"");
    expect(source).toContain("document.addEventListener(\"keydown\", handleEscape)");
  });

  it("closes the drawer after selecting or creating a conversation", async () => {
    const source = await readFile(
      new URL("./chat-client.tsx", import.meta.url),
      "utf8",
    );
    const drawer = source.slice(source.indexOf('data-testid="chat-history-drawer"'));
    expect(drawer).toContain("setHistoryOpen(false)");
    expect(drawer).toContain("handleSelectConversation(id)");
    expect(drawer).not.toContain("app-navigation");
  });
});
