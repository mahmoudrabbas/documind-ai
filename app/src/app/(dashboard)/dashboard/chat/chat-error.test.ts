import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { ApiError } from "@/lib/api-client";
import { getChatErrorPresentation } from "./chat-error";

describe("chat provider error presentation", () => {
  it("shows a recoverable rate-limit state with retry delay", () => {
    const presentation = getChatErrorPresentation(new ApiError({
      status: 429,
      code: "LLM_RATE_LIMITED",
      message: "safe API message",
      retryAfterSeconds: 37,
    }));
    expect(presentation).toEqual({
      message: "The AI provider is temporarily rate-limited. Please try again shortly.",
      retryAfterSeconds: 37,
    });
  });

  it.each([
    ["LLM_PROVIDER_UNAVAILABLE", "The AI provider is temporarily unavailable. Please try again shortly."],
    ["LLM_TIMEOUT", "The AI provider timed out. Please try again."],
    ["RETRIEVAL_UNAVAILABLE", "Document search is temporarily unavailable. Please try again shortly."],
  ])("distinguishes %s", (code, message) => {
    expect(getChatErrorPresentation(new ApiError({ status: 503, code, message: "ignored" }))).toEqual({
      message,
      retryAfterSeconds: null,
    });
  });

  it("does not display arbitrary provider payload text", () => {
    const presentation = getChatErrorPresentation(new ApiError({
      status: 500,
      message: "secret provider quota org_123",
    }));
    expect(presentation.message).not.toContain("org_123");
  });

  it("blocks repeated chat submission for the supplied retry delay", async () => {
    const source = await readFile(new URL("./chat-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("isTyping || retryAfterSeconds !== null");
    expect(source).toContain("disabled={!input.trim() || isTyping || retryAfterSeconds !== null}");
    expect(source).toContain("Retry in ${retryAfterSeconds}s.");
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
