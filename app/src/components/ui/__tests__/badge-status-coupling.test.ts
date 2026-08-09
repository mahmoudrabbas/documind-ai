import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SUBSCRIPTION_BADGE_STATUS } from "../variants";

/**
 * Guards the badge colour/text coupling.
 *
 * `getBadgeClasses` resolves an unrecognised `status` to a grey "neutral"
 * pill without throwing, and `<Badge>` falls back to rendering `status`
 * as its own text. Together that means passing a *translated* label as
 * `status` silently turns the pill grey — no error, no failing render.
 *
 * So `status` must always be a semantic BadgeStatus or a value from an
 * explicit code map, never a raw API field. Visible text belongs in the
 * `label` prop.
 */

const SRC_ROOT = join(__dirname, "..", "..", "..");
const SEMANTIC_STATUSES = ["success", "warning", "error", "info", "neutral"];

function collectTsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsxFiles(full, acc);
    } else if (entry.endsWith(".tsx")) {
      acc.push(full);
    }
  }
  return acc;
}

describe("Badge status/label coupling", () => {
  const files = collectTsxFiles(SRC_ROOT);

  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("never passes a raw API field straight in as the colour key", () => {
    /* `status={foo.status}` / `.state` / `.result` / `.direction` — these
       carry backend text, so they must go through a code map first. */
    const rawFieldAsStatus = /status=\{\s*\w+\.(status|state|result|direction)\s*\}/;
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (rawFieldAsStatus.test(source)) {
        offenders.push(file.replace(SRC_ROOT, "src"));
      }
    }

    expect(
      offenders,
      `Pass the code through a Record<string, BadgeStatus> map and put the ` +
        `visible text in \`label\`:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  /* `StatusPill` (super-admin tables) has the same coupling as `<Badge>`:
     `value` picks the colour AND used to render as the text. It takes a
     `label` prop for the same reason. The rule below is the inverse of the
     Badge one — `value` must stay a raw code, so what we assert is that any
     pill showing a *translated* label still routes colour through `value`. */
  it("never passes a translated string as the StatusPill colour key", () => {
    /* Scoped to the opening tag itself. A file-wide search would flag any
       page that happens to render both a `StatusPill` and an unrelated
       `<Detail value={t(…)} />`, where a translated `value` is correct. */
    const translatedAsValue = /<StatusPill\b[^>]*\bvalue=\{\s*(?:t|tPlural)\(/;
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (translatedAsValue.test(source)) {
        offenders.push(file.replace(SRC_ROOT, "src"));
      }
    }

    expect(
      offenders,
      `StatusPill colours from \`value\`, so a translated string there ` +
        `silently greys the pill. Keep the raw code in \`value\` and pass ` +
        `the text via \`label\`:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

describe("SUBSCRIPTION_BADGE_STATUS", () => {
  it("maps every code to a semantic badge status, not to display text", () => {
    for (const [code, status] of Object.entries(SUBSCRIPTION_BADGE_STATUS)) {
      expect(SEMANTIC_STATUSES, `"${code}" maps to "${status}"`).toContain(status);
    }
  });

  it("is keyed on the API's SCREAMING_SNAKE codes", () => {
    for (const code of Object.keys(SUBSCRIPTION_BADGE_STATUS)) {
      expect(code).toMatch(/^[A-Z][A-Z_]*$/);
    }
  });

  it("covers the documented subscription statuses", () => {
    for (const code of [
      "ACTIVE",
      "TRIALING",
      "INCOMPLETE",
      "PAST_DUE",
      "PAUSED",
      "CANCEL_AT_PERIOD_END",
      "CANCELED",
      "EXPIRED",
      "UNPAID",
    ]) {
      expect(SUBSCRIPTION_BADGE_STATUS[code]).toBeDefined();
    }
  });
});
