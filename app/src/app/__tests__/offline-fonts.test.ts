import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const appRoot = resolve(import.meta.dirname, "..");

describe("offline font configuration", () => {
  test("does not require Google Fonts at build or runtime", () => {
    const fontModule = readFileSync(resolve(appRoot, "fonts.ts"), "utf8");
    const layout = readFileSync(resolve(appRoot, "layout.tsx"), "utf8");
    const globals = readFileSync(resolve(appRoot, "globals.css"), "utf8");
    const source = `${fontModule}\n${layout}\n${globals}`;

    expect(source).not.toContain("next/font/google");
    expect(source).not.toContain("fonts.googleapis.com");
    expect(source).not.toContain("fonts.gstatic.com");
  });
});
