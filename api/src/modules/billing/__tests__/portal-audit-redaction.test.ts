import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("billing portal audit safety", () => {
  it("uses the typed action and does not include provider customer IDs in audit changes", async () => {
    const source = await readFile(new URL("../../checkout/checkout.service.ts", import.meta.url), "utf8");
    const portal = source.slice(source.indexOf("export async function createBillingPortalSession"));
    const audit = portal.slice(portal.indexOf("writeAudit("), portal.indexOf("return { url"));
    expect(audit).toContain('"BILLING_PORTAL_SESSION_CREATED"');
    expect(audit).not.toContain("providerCustomerId");
    expect(source).not.toContain("action: action as never");
  });
});
