import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("chat assistant rendering (markdown + safety)", () => {
  it("renders assistant content through AssistantMarkdown only", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain(
      'import { AssistantMarkdown } from "@/components/domain/AssistantMarkdown";',
    );
    expect(source).toContain('msg.role === "user" ? (');
    expect(source).toContain('<AssistantMarkdown content={msg.content} />');
  });

  it("keeps user messages plain text (not markdown)", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("whitespace-pre-line");
    expect(source).toContain("{msg.content}");
    const start = source.indexOf("msg.role === \"user\" ? (");
    const end = source.indexOf(") : (", start);
    const userBranch = source.slice(start, end);
    expect(userBranch).toContain("whitespace-pre-line");
    expect(userBranch).not.toContain("AssistantMarkdown");
  });

  it("applies content-based direction to user messages", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("getContentDirection(msg.content)");
    expect(source).toContain('dir={contentDir.dir}');
    expect(source).toContain('lang={contentDir.lang}');
  });

  it("preserves source citations in assistant messages", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("msg.sources && msg.sources.length > 0");
    expect(source).toContain("import { SourceList } from \"@/components/domain/ChatSources\";");
    expect(source).toContain("<SourceList");
    expect(source).toContain("setPdfViewer({");
    expect(source).toContain('documentId: source.documentId');
    expect(source).toContain('highlightText: source.text');
    expect(source).toContain('documentTitle: source.documentTitle');
    expect(source).toContain("<PdfViewerModal");
  });

  it("hides the internal retrieval score from the chat message UI", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("src.score");
    expect(source).not.toContain("(src.score * 100)");
  });

  it("renders the source section only for messages that carry sources (social/unsupported replies stay clean)", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    // The whole source section is guarded by the sources-array check, so
    // source-less replies (social, clarification, unsupported, evidence-gated)
    // render as a plain assistant bubble with no citation UI.
    const gate = source.indexOf("{msg.sources && msg.sources.length > 0 && (");
    expect(gate).toBeGreaterThan(-1);
    expect(source.slice(0, gate)).not.toContain("<SourceList");
    expect(source.slice(gate)).toContain("<SourceList");
  });

  it("preserves the feedback widget for assistant messages", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain('import { FeedbackWidget } from "@/components/domain/FeedbackWidget";');
    expect(source).toContain("<FeedbackWidget");
    expect(source).toContain('messageId={msg.id}');
    expect(source).toContain('conversationId={activeConversation}');
  });

  it("never renders raw assistant content as unsafe HTML", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("does not render model-generated remote images automatically", async () => {
    const markdownSource = await readFile(
      new URL("../../../../components/domain/AssistantMarkdown.tsx", import.meta.url),
      "utf8",
    );
    expect(markdownSource).toContain("skipHtml");
    expect(markdownSource).toContain("IgnoredImage");
  });

  it("surfaces a single retryable error presentation without an assistant bubble", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    // The error banner is shown once...
    expect(source).toContain("setError(presentation.message);");
    // ...and the error text is never injected into an assistant message bubble.
    expect(source).not.toContain("content: presentation.message");
  });

  it("formats the sidebar preview through previewText only", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain(
      'import { previewText } from "./preview-text";',
    );
    expect(source).toContain("previewText(conv.lastMessage)");
    expect(source).toContain('|| t("chat.noMessagesYet")');
  });

  it("keeps the full stored assistant content unchanged (rendered via AssistantMarkdown)", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("<AssistantMarkdown content={msg.content} />");
    expect(source).not.toContain("<AssistantMarkdown content={previewText(");
  });
});

describe("chat history mobile drawer", () => {
  it("renders the conversation list from a single shared panel", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("function ConversationPanel");
    expect(source.match(/<ConversationPanel/g)).toHaveLength(2);
  });

  it("adds a mobile-only toggle that opens the chat-history drawer", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain('data-testid="chat-mobile-history-toggle"');
    expect(source).toContain("setHistoryOpen(true)");
    expect(source).toContain('aria-haspopup="dialog"');
    expect(source).toContain("aria-expanded={historyOpen}");
  });

  it("shows the active conversation title in the mobile header", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("activeConversationTitle");
    expect(source).toContain("activeTitleDir");
  });

  it("keeps the mobile drawer separate from the global navigation drawer", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain('data-testid="chat-history-drawer"');
    expect(source).toContain("md:hidden");
    expect(source).toContain("role=\"dialog\"");
    expect(source).toContain("aria-modal=\"true\"");
    // Backdrop + Escape both close it.
    expect(source).toContain('data-testid="chat-history-backdrop"');
    expect(source).toContain("onClick={() => setHistoryOpen(false)}");
    expect(source).toContain('if (event.key === "Escape") setHistoryOpen(false);');
  });

  it("locks body scroll while the drawer is open and restores it on close", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("document.body.style.overflow = \"hidden\"");
    expect(source).toContain("previousOverflow");
  });

  it("closes the drawer after selecting or creating a conversation", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    const drawer = source.slice(source.indexOf('data-testid="chat-history-drawer"'));
    expect(drawer).toContain("setHistoryOpen(false)");
    expect(drawer).not.toContain("app-navigation");
  });

  it("keeps desktop and tablet history present without crowding the chat canvas", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain('data-testid="chat-conversations-sidebar"');
    expect(source).toContain("md:flex");
    expect(source).toContain("w-56");
    expect(source).toContain("lg:w-64");
    expect(source).toContain("xl:w-72");
    expect(source).toContain("min-w-0 flex-1");
  });

  it("keeps the chat shell and scroll regions in the available-height flex chain", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain(
      '<div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl',
    );
    expect(source).toContain(
      '<div className="flex min-w-0 flex-1 flex-col bg-surface-container-lowest">',
    );
    expect(source).toContain(
      '<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-5',
    );
    expect(source).toContain(
      '<div className="min-w-0 border-t border-outline-variant/20 bg-surface/95',
    );
  });
});
