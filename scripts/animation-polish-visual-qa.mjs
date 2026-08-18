// Browser QA for the global landing-page motion and interaction polish pass.
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = resolve(process.argv[2] ?? "/tmp/animation-polish-qa");
mkdirSync(OUT, { recursive: true });
let failures = 0;

function check(name, ok, detail = "") {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

const viewports = [
  ["en-desktop-1440", { width: 1440, height: 900 }, "en"],
  ["en-desktop-1365", { width: 1365, height: 768 }, "en"],
  ["en-tablet-1024", { width: 1024, height: 768 }, "en"],
  ["en-mobile-390", { width: 390, height: 844 }, "en"],
  ["en-mobile-375", { width: 375, height: 812 }, "en"],
  ["ar-desktop-1440", { width: 1440, height: 900 }, "ar"],
  ["ar-desktop-1365", { width: 1365, height: 768 }, "ar"],
  ["ar-tablet-1024", { width: 1024, height: 768 }, "ar"],
  ["ar-mobile-390", { width: 390, height: 844 }, "ar"],
  ["ar-mobile-375", { width: 375, height: 812 }, "ar"],
];

async function createPage(viewport, locale, reducedMotion = false) {
  const context = await browser.newContext({ viewport, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  if (locale === "ar") {
    await context.addCookies([
      { name: "documind-locale", value: "ar", url: BASE },
      { name: "documind-locale-explicit", value: "1", url: BASE },
    ]);
  }
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("main").waitFor({ state: "attached", timeout: 60000 });
  return { context, page };
}

const browser = await chromium.launch();

for (const [name, viewport, locale] of viewports) {
  console.log(`\n${name}`);
  const { context, page } = await createPage(viewport, locale);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  const result = await page.evaluate(() => {
    const ids = ["how-it-works", "permission-aware", "grounded-answers", "solutions", "security", "pricing", "faq", "get-started"];
    const sections = ids.map((id) => document.getElementById(id));
    const footer = document.querySelector("footer");
    const links = [...document.querySelectorAll("a")];
    const animations = [...document.querySelectorAll("*")].map((el) => getComputedStyle(el).animationName).filter((name) => name !== "none");
    return {
      dir: document.documentElement.dir,
      idsPresent: sections.every(Boolean),
      ordered: sections.every((section, index) => index === 0 || section.offsetTop > sections[index - 1].offsetTop),
      footerAfterCta: Boolean(footer && footer.offsetTop > document.getElementById("get-started").offsetTop),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      pulseCount: animations.filter((name) => name === "pulse").length,
      heroCta: Boolean(document.querySelector('a[href="/register"]')),
      signIn: Boolean(document.querySelector('a[href="/login"]')),
      unresolved: (document.body.textContent ?? "").includes("landing."),
    };
  });
  check("correct document direction", result.dir === (locale === "ar" ? "rtl" : "ltr"), result.dir);
  check("approved sections exist in order", result.idsPresent && result.ordered);
  check("footer follows Final CTA", result.footerAfterCta);
  check("no horizontal overflow", result.overflow <= 1, `overflow=${result.overflow}`);
  check("no continuous pulse animation remains", result.pulseCount === 0, `pulse=${result.pulseCount}`);
  check("CTA routes remain intact", result.heroCta && result.signIn);
  check("no unresolved translations", !result.unresolved);
  await context.close();
}

console.log("\nReduced-motion resolution");
{
  const { context, page } = await createPage({ width: 390, height: 844 }, "en", true);
  await page.waitForTimeout(250);
  const result = await page.evaluate(() => ({
    hidden: [...document.querySelectorAll("main h1, main h2, main h3, main p, main li")].filter((el) => {
      const style = getComputedStyle(el);
      return el.getClientRects().length > 0 && style.visibility !== "hidden" && parseFloat(style.opacity) === 0 && el.getAttribute("aria-hidden") !== "true";
    }).map((el) => el.textContent?.trim().slice(0, 40)),
    delays: [...document.querySelectorAll("main")].flatMap((root) => [...root.querySelectorAll("*")].map((el) => getComputedStyle(el).transitionDelay)).filter((delay) => delay !== "0s"),
    smooth: getComputedStyle(document.documentElement).scrollBehavior,
    infinite: [...document.querySelectorAll("*")].filter((el) => getComputedStyle(el).animationIterationCount === "infinite").length,
  }));
  check("no content remains hidden", result.hidden.length === 0, JSON.stringify(result.hidden));
  check("no staged transition delays remain", result.delays.length === 0, JSON.stringify(result.delays));
  check("anchor scrolling is not smooth", result.smooth === "auto", result.smooth);
  check("no continuous motion remains", result.infinite === 0, `infinite=${result.infinite}`);
  await context.close();
}

console.log("\nInteractive states");
{
  const { context, page } = await createPage({ width: 390, height: 844 }, "en");
  const menu = page.locator('button[aria-controls="public-nav-mobile-menu"]');
  await menu.waitFor({ state: "visible" });
  await page.waitForTimeout(250);
  await menu.click();
  await page.locator("#public-nav-mobile-menu").waitFor({ state: "attached" });
  check("mobile menu opens", await menu.getAttribute("aria-expanded") === "true");
  await page.keyboard.press("Escape");
  check("Escape closes mobile menu", await menu.getAttribute("aria-expanded") === "false");
  check("Escape restores menu focus", await page.evaluate(() => document.activeElement?.getAttribute("aria-controls") === "public-nav-mobile-menu"));

  await page.locator("#grounded-answers").scrollIntoViewIfNeeded();
  const insufficient = page.getByRole("button", { name: "Insufficient evidence" });
  await insufficient.click();
  check("insufficient evidence state has no fabricated answer", await page.locator("#grounded-answers [data-state='supported']").count() === 0 || !(await page.locator("#grounded-answers").locator("p").filter({ hasText: /^15 minutes$/ }).count()));
  await page.getByRole("button", { name: "Grounded answer" }).click();
  check("supported evidence state restores", (await page.locator("#grounded-answers").innerText()).includes("15 minutes"));

  await page.locator("#faq").scrollIntoViewIfNeeded();
  const faq = page.locator("#faq button").nth(1);
  await faq.click();
  check("FAQ opens interactively", await faq.getAttribute("aria-expanded") === "true");
  await faq.click();
  check("FAQ closes interactively", await faq.getAttribute("aria-expanded") === "false");
  await page.screenshot({ path: join(OUT, "interaction-states.png"), fullPage: false });
  await context.close();
}

console.log("\nRepresentative states and progression");
{
  const { context, page } = await createPage({ width: 1440, height: 900 }, "en");
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, "hero-resolved.png"), fullPage: false });

  const stageLabels = [];
  for (const index of [0, 1, 2, 3, 4, 3, 2, 1, 0]) {
    await page.evaluate((target) => {
      const stages = [...document.querySelectorAll("#how-it-works [data-stage-index]")].filter((el) => getComputedStyle(el).display !== "none" && el.closest(".min-\\[1024px\\]\\:hidden") === null);
      stages.find((el) => Number(el.getAttribute("data-stage-index")) === target)?.scrollIntoView({ block: "center" });
    }, index);
    await page.waitForTimeout(120);
    stageLabels.push(await page.locator("#how-it-works [data-active-label]").textContent());
    if (index === 2 && stageLabels.length === 3) {
      await page.screenshot({ path: join(OUT, "how-it-works-mid-stage.png"), fullPage: false });
    }
  }
  check("How-it-Works progresses forward and reverse without blank states", stageLabels.every(Boolean), JSON.stringify(stageLabels));
  check("How-it-Works reaches all five stages", new Set(stageLabels.slice(0, 5)).size === 5, JSON.stringify(stageLabels.slice(0, 5)));

  await page.locator("#grounded-answers").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(OUT, "grounded-evidence-supported.png"), fullPage: false });
  await page.getByRole("button", { name: "Insufficient evidence" }).click();
  await page.screenshot({ path: join(OUT, "grounded-evidence-insufficient.png"), fullPage: false });

  await page.locator("#faq").scrollIntoViewIfNeeded();
  const middleFaq = page.locator("#faq button").nth(4);
  await middleFaq.click();
  check("middle FAQ opens with correct semantics", await middleFaq.getAttribute("aria-expanded") === "true");
  await page.screenshot({ path: join(OUT, "faq-open.png"), fullPage: false });

  await page.locator("#get-started").scrollIntoViewIfNeeded();
  await page.waitForTimeout(650);
  await page.screenshot({ path: join(OUT, "final-cta-resolved.png"), fullPage: false });

  const focusTargets = ["#pricing a[href='/register']", "#get-started a[href='/register']", "footer a[href='/register']", "footer a[href='/login']"];
  await page.evaluate(() => {
    (document.activeElement instanceof HTMLElement ? document.activeElement : null)?.blur();
    document.body.tabIndex = -1;
    document.body.focus();
  });
  const focusResults = Object.fromEntries(focusTargets.map((selector) => [selector, false]));
  for (let i = 0; i < 120 && Object.values(focusResults).some((value) => !value); i++) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate((selectors) => {
      const active = document.activeElement;
      const selector = selectors.find((item) => active?.matches(item));
      return selector ? { selector, outline: getComputedStyle(active).outlineStyle } : null;
    }, focusTargets);
    if (focused) focusResults[focused.selector] = focused.outline !== "none";
  }
  check("pricing, CTA, and footer links retain visible keyboard focus", Object.values(focusResults).every(Boolean), JSON.stringify(focusResults));
  const footerHrefs = await page.locator("footer a").evaluateAll((items) => items.map((item) => item.getAttribute("href")));
  check("every footer link remains verified", JSON.stringify(footerHrefs) === JSON.stringify(["/", "#how-it-works", "#security", "#pricing", "#faq", "/register", "/login"]), JSON.stringify(footerHrefs));
  await context.close();
}

console.log("\nArabic interaction and direction");
{
  const { context, page } = await createPage({ width: 390, height: 844 }, "ar");
  const menu = page.locator('button[aria-controls="public-nav-mobile-menu"]');
  await page.waitForTimeout(250);
  await menu.click();
  check("Arabic mobile navbar opens", await menu.getAttribute("aria-expanded") === "true");
  await page.keyboard.press("Escape");

  await page.locator("#grounded-answers").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "أدلة غير كافية" }).click();
  check("Arabic insufficient state resolves without answer", await page.locator("#grounded-answers").locator("p").filter({ hasText: /^15 دقيقة$/ }).count() === 0);
  await page.getByRole("button", { name: "إجابة مدعومة" }).click();

  const arrows = await page.evaluate(() => ({
    hero: getComputedStyle(document.querySelector("section a[href='/register'] .material-symbols-outlined")).rotate,
    final: getComputedStyle(document.querySelector("#get-started a[href='/register'] .material-symbols-outlined")).rotate,
    faqDir: document.querySelector("#faq")?.getAttribute("dir"),
    flowDir: document.querySelector("#how-it-works")?.getAttribute("dir"),
  }));
  check("Arabic directional CTA arrows are mirrored", arrows.hero !== "none" && arrows.final !== "none", JSON.stringify(arrows));
  check("Arabic FAQ and knowledge flow remain RTL", arrows.faqDir === "rtl" && arrows.flowDir === "rtl", JSON.stringify(arrows));
  await context.close();
}

await browser.close();
if (failures) {
  console.error(`\n${failures} ANIMATION POLISH QA CHECK(S) FAILED`);
  process.exit(1);
}
console.log("\nALL ANIMATION POLISH QA CHECKS PASSED");
