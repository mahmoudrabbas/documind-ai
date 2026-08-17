import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const shellUrl = new URL("./auth-split-shell.tsx", import.meta.url);
const heroUrl = new URL("../ui/AuthHeroPanel.tsx", import.meta.url);
const authDir = new URL("../../app/(auth)/", import.meta.url);

describe("shared auth split shell", () => {
  it("constrains the desktop shell to the dynamic viewport", async () => {
    const source = await readFile(shellUrl, "utf8");

    expect(source).toContain("data-auth-shell");
    expect(source).toContain("min-h-dvh");
    expect(source).toContain("lg:h-dvh");
    expect(source).toContain("lg:overflow-hidden");
    expect(source).toContain("data-auth-form-panel");
    expect(source).toContain("lg:overflow-y-auto");
  });

  it("keeps mobile naturally scrollable without horizontal overflow", async () => {
    const source = await readFile(shellUrl, "utf8");

    expect(source).toContain("overflow-x-hidden");
    expect(source).not.toMatch(/className="[^"]*overflow-y-hidden/);
    expect(source).not.toContain("fixed");
  });

  it("clips and viewport-scales the presentation-only hero", async () => {
    const source = await readFile(heroUrl, "utf8");

    expect(source).toContain("data-auth-hero-panel");
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain("h-full min-h-0 min-w-0");
    expect(source).toContain("overflow-hidden");
    expect(source).toContain("h-[min(70dvh,37.5rem)]");
  });

  it("is shared by all three pages while register compacts into two desktop columns", async () => {
    const [login, register, superAdmin] = await Promise.all([
      readFile(new URL("login/page.tsx", authDir), "utf8"),
      readFile(new URL("register/page.tsx", authDir), "utf8"),
      readFile(new URL("super-admin/login/page.tsx", authDir), "utf8"),
    ]);

    for (const source of [login, register, superAdmin]) {
      expect(source).toContain("<AuthSplitShell");
      expect(source).not.toContain("min-h-screen");
    }
    expect(register).toContain("lg:grid-cols-2");
    expect(superAdmin).toContain("showBackToHome={false}");
  });
});
