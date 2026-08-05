import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("chat assistant rendering (markdown + safety)", () => {
  it("renders assistant content through AssistantMarkdown only", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain(
      'import { AssistantMarkdown } from "@/components/domain/AssistantMarkdown";',
    );
    expect(source).toContain(
      'msg.role === "user" ? (\n                      <p className="whitespace-pre-line">{msg.content}</p>\n                    ) : (\n                      <AssistantMarkdown content={msg.content} />\n                    )',
    );
  });

  it("keeps user messages plain text (not markdown)", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain('<p className="whitespace-pre-line">{msg.content}</p>');
    const start = source.indexOf("msg.role === \"user\" ? (");
    const end = source.indexOf(") : (", start);
    const userBranch = source.slice(start, end);
    expect(userBranch).toContain("whitespace-pre-line");
    expect(userBranch).not.toContain("AssistantMarkdown");
  });

  it("preserves source citations in assistant messages", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("msg.sources && msg.sources.length > 0");
    expect(source).toContain("setPdfViewer({");
    expect(source).toContain("src.documentTitle ?? \"Document\"");
    expect(source).toContain("<PdfViewerModal");
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
    expect(source).toContain('|| "No messages yet"');
  });

  it("keeps the full stored assistant content unchanged (rendered via AssistantMarkdown)", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("<AssistantMarkdown content={msg.content} />");
    expect(source).not.toContain("<AssistantMarkdown content={previewText(");
  });
});
