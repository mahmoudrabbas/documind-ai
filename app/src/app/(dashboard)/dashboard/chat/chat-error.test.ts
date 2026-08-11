import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { ApiError } from "@/lib/api-client";
import { t as translateKey } from "@/lib/i18n/i18n.utils";
import ar from "@/lib/i18n/translations/ar";
import en from "@/lib/i18n/translations/en";
import { ChatStreamError } from "@/services/chat.service";
import { getChatErrorPresentation } from "./chat-error";

const translate = (key: string) => translateKey(en, key);
const translateAr = (key: string) => translateKey(ar, key);

describe("chat provider error presentation", () => {
  it("shows a recoverable rate-limit state with retry delay", () => {
    const presentation = getChatErrorPresentation(new ApiError({
      status: 429,
      code: "LLM_RATE_LIMITED",
      message: "safe API message",
      retryAfterSeconds: 37,
    }), translate);
    expect(presentation).toEqual({
      message: "The AI service is temporarily rate-limited. Please try again shortly.",
      retryAfterSeconds: 37,
    });
  });

  it.each([
    ["LLM_PROVIDER_UNAVAILABLE", "The AI service is temporarily unavailable. Please try again shortly."],
    ["LLM_TIMEOUT", "The AI service took too long to respond. Please try again."],
    ["RETRIEVAL_UNAVAILABLE", "Document search is temporarily unavailable. Please try again shortly."],
  ])("distinguishes %s", (code, message) => {
    expect(getChatErrorPresentation(new ApiError({ status: 503, code, message: "ignored" }), translate)).toEqual({
      message,
      retryAfterSeconds: null,
    });
  });

  it.each([
    [
      "LLM_RATE_LIMITED",
      "The AI service is temporarily rate-limited. Please try again shortly.",
    ],
    [
      "LLM_PROVIDER_UNAVAILABLE",
      "The AI service is temporarily unavailable. Please try again shortly.",
    ],
    [
      "LLM_TIMEOUT",
      "The AI service took too long to respond. Please try again.",
    ],
  ])("distinguishes stream error %s", (code, message) => {
    expect(getChatErrorPresentation(
      new ChatStreamError("raw backend message", code, 503, true),
      translate,
    )).toEqual({ message, retryAfterSeconds: null });
  });

  it.each([
    [
      "LLM_RATE_LIMITED",
      "خدمة الذكاء الاصطناعي تواجه ضغطًا مؤقتًا. يرجى المحاولة مرة أخرى بعد قليل.",
    ],
    [
      "LLM_PROVIDER_UNAVAILABLE",
      "خدمة الذكاء الاصطناعي غير متاحة مؤقتًا. يرجى المحاولة مرة أخرى بعد قليل.",
    ],
    [
      "LLM_TIMEOUT",
      "استغرقت خدمة الذكاء الاصطناعي وقتًا أطول من المتوقع. يرجى المحاولة مرة أخرى.",
    ],
  ])("localizes Arabic stream error %s", (code, message) => {
    expect(getChatErrorPresentation(
      new ChatStreamError("raw backend message", code, 503, true),
      translateAr,
    )).toEqual({ message, retryAfterSeconds: null });
  });

  it("keeps unknown stream error codes generic", () => {
    expect(getChatErrorPresentation(
      new ChatStreamError("raw backend message org_123", "RAW_PROVIDER_ERROR", 502, true),
      translate,
    )).toEqual({
      message: "Failed to get a response. Please try again.",
      retryAfterSeconds: null,
    });
  });

  it("does not display arbitrary provider payload text", () => {
    const presentation = getChatErrorPresentation(new ApiError({
      status: 500,
      message: "secret provider quota org_123",
    }), translate);
    expect(presentation.message).not.toContain("org_123");
  });

  it("blocks repeated chat submission for the supplied retry delay", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("isTyping || retryAfterSeconds !== null");
    expect(source).toContain("disabled={!input.trim() || isTyping || retryAfterSeconds !== null}");
    expect(source).toContain('t("chat.error.retryCountdown"');
    expect(source).toContain("setIsTyping(false);");
    expect(source).toContain("setProgressStage(null);");
  });

  it("does not create stale assistant source bubbles on failed provider responses", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("setError(presentation.message);");
    expect(source).not.toContain("role: \"assistant\",\\n        content: presentation.message");
  });

  it("surfaces entitlement denials with an UpgradePrompt banner that keeps the conversation intact", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("import { UpgradePrompt }");
    expect(source).toContain("mapEntitlementError(err)");
    expect(source).toContain("setEntitlementBanner(denial)");
    expect(source).toContain("entitlementBanner.kind === \"subscription-inactive\"");
    expect(source).toContain("router.push(\"/checkout\")");
  });
});
