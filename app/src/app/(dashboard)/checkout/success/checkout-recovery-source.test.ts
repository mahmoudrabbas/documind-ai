import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("checkout return recovery flow", () => {
  it("synchronizes before polling and repeats that order on Retry", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    const syncCall = source.indexOf("await synchronizeCheckoutSession(sessionId");
    const pollCall = source.indexOf("await poll()", syncCall);
    expect(syncCall).toBeGreaterThan(0);
    expect(pollCall).toBeGreaterThan(syncCall);
    expect(source).toContain("setRetryKey((value) => value + 1)");
  });

  it("keeps provider failures recoverable and does not call them payment failures", async () => {
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("Provider temporarily unavailable");
    expect(source).toContain("Your completed payment has not been marked as failed");
    expect(source).not.toContain("Payment failed");
  });
});
