import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const componentUrl = new URL("./auth-page-shell.tsx", import.meta.url);
const inviteUrl = new URL(
  "../../app/set-password-from-invite/set-password-from-invite-client.tsx",
  import.meta.url,
);
const verifyUrl = new URL(
  "../../app/verify-email/verify-email-client.tsx",
  import.meta.url,
);

describe("shared auth page shell", () => {
  it("keeps every principal layer full width with a readable card maximum", async () => {
    const source = await readFile(componentUrl, "utf8");
    expect(source).toContain("min-h-screen w-full");
    expect(source).toContain("min-h-screen w-full max-w-7xl");
    expect(source).toContain("w-full min-w-0 max-w-[36rem]");
    expect(source).not.toMatch(/w-fit|max-w-xs|max-w-sm|inline-block/);
  });

  it("is shared by invitation and verification states", async () => {
    const [invite, verify] = await Promise.all([
      readFile(inviteUrl, "utf8"),
      readFile(verifyUrl, "utf8"),
    ]);
    expect(invite).toContain("<AuthPageShell");
    expect(verify).toContain("<AuthPageShell");
    expect(invite).toContain('id="password"');
    expect(invite).toContain('id="confirmPassword"');
    expect(invite).toMatch(/id="password"[\s\S]*?className="[^"]*w-full/);
    expect(invite).toMatch(
      /id="confirmPassword"[\s\S]*?className="[^"]*w-full/,
    );
    expect(invite).toContain("h-12 w-full");
    for (const state of ["loading", "success", "error"]) {
      expect(verify).toContain(`"${state}"`);
    }
  });
});
