import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import en from "@/lib/i18n/translations/en";
import ar from "@/lib/i18n/translations/ar";

const COMPOSER_KEYS = [
  "chat.sendAriaLabel",
  "chat.thinking",
  "chat.loadingConversation",
  "chat.emptyTitle",
] as const;

describe("chat composer (phase 3)", () => {
  const readClient = () =>
    readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");

  it("adds accessible labels to the send, image, microphone, and remove buttons", async () => {
    const source = await readClient();
    expect(source).toContain('aria-label={t("chat.sendAriaLabel")}');
    expect(source).toContain('aria-label={t("chat.attachImage")}');
    expect(
      source,
    ).toContain(
      'isRecording ? t("chat.stopRecording") : t("chat.voiceInput")',
    );
    expect(source).toContain('aria-label={t("chat.removeImage")}');
  });

  it("keeps the send button disabled while typing or rate-limited", async () => {
    const source = await readClient();
    expect(
      source,
    ).toContain(
      "disabled={!input.trim() || isTyping || retryAfterSeconds !== null}",
    );
  });

  it("renders the processing state as a single live status region", async () => {
    const source = await readClient();
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('t("chat.thinking")');
    expect(source).toContain('aria-hidden="true"');
  });

  it("keeps loading-history and waiting-for-response as separate state paths", async () => {
    const source = await readClient();
    expect(source).toContain('t("chat.loadingConversation")');
    expect(source).toContain('t("chat.thinking")');
    expect(source).toContain("loadingMessages ?");
    expect(source).toContain("{isTyping && (");
  });

  it("localizes the empty-state heading and description", async () => {
    const source = await readClient();
    expect(source).toContain('t("chat.emptyTitle")');
    expect(source).toContain('t("chat.emptyDescription")');
  });

  it("keeps suggested prompt chips on the existing handleSend(t(key)) path", async () => {
    const source = await readClient();
    expect(source).toContain("onClick={() => handleSend(t(key))}");
  });

  it("preserves Enter to send and Shift+Enter for newlines", async () => {
    const source = await readClient();
    expect(source).toContain('if (e.key === "Enter" && !e.shiftKey)');
    expect(source).toContain("e.preventDefault();");
  });

  it("keeps bounded auto-grow frontend-only", async () => {
    const source = await readClient();
    expect(source).toContain("textareaRef");
    expect(source).toContain("scrollHeight");
    expect(source).toContain("MAX_TEXTAREA_HEIGHT");
  });

  it("keeps browser-push transports out of the chat stage progress", async () => {
    const source = await readClient();
    // Stage progress uses a fetch + body reader SSE stream; EventSource and
    // WebSocket transports remain forbidden.
    for (const forbidden of [
      "EventSource",
      "WebSocket",
      "Retrieving...",
      "Reranking...",
      "Verifying...",
      "Generating...",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain("sendMessageStream");
  });

  it("localizes every SSE progress stage in both locales", () => {
    for (const stage of [
      "intent",
      "search",
      "evidence",
      "answer",
      "verify",
      "finalize",
    ]) {
      const key = `chat.progress.${stage}`;
      expect(en[key]).not.toBe("");
      expect(ar[key]).not.toBe("");
      expect(ar[key]).not.toBe(en[key]);
    }
  });

  it("adds the new composer keys to both locales with matching parity", () => {
    const enKeys = Object.keys(en);
    const arKeys = Object.keys(ar);
    expect(arKeys).toEqual(enKeys);
    for (const key of COMPOSER_KEYS) {
      expect(en[key]).not.toBe("");
      expect(ar[key]).not.toBe("");
      expect(ar[key]).not.toBe(en[key]);
    }
    expect(en["chat.emptyTitle"]).toBe("Ask DocuMind AI");
    expect(ar["chat.emptyTitle"]).toBe("اسأل DocuMind AI");
    expect(en["chat.emptyDescription"]).toContain("grounded answers with sources");
  });
});
