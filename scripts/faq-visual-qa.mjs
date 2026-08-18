// Programmatic visual QA for the FAQ section (Section 9).
// Verifies geometry, colors, RTL, overflow, sticky behavior, and interaction
// in a real browser without relying on eyeballing screenshots.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
let failures = 0;

function check(name, ok, detail = "") {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

const browser = await chromium.launch();

async function withPage(viewport, locale, fn) {
  const context = await browser.newContext({ viewport });
  if (locale === "ar") {
    await context.addCookies([
      { name: "documind-locale", value: "ar", url: BASE },
      { name: "documind-locale-explicit", value: "1", url: BASE },
    ]);
  }
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.locator("#faq").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await fn(page);
  await context.close();
}

// ── Desktop English ────────────────────────────────────────────────────────
console.log("\nDesktop English 1440×900");
await withPage({ width: 1440, height: 900 }, "en", async (page) => {
  const sec = await page.locator("#faq").boundingBox();
  check("section exists with height", sec && sec.height > 600, `h=${sec?.height}`);

  // No horizontal overflow on the whole document.
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  check("no horizontal overflow", overflow.scrollW <= overflow.clientW + 1, `scrollW=${overflow.scrollW} clientW=${overflow.clientW}`);

  // Two-column layout on lg.
  const intro = await page.locator("#faq h2").boundingBox();
  const list = await page.locator("#faq ul").boundingBox();
  check("two-column layout", intro && list && list.x > intro.x + intro.width - 10, `intro.x=${intro?.x} list.x=${list?.x}`);

  // Sticky intro on lg.
  const introBox = await page.locator("#faq > div > div > div").first().evaluate((el) => getComputedStyle(el).position);
  check("intro is sticky on desktop", introBox === "sticky", introBox);

  // Editorial: 9 ruled rows, no cards (no rounded corners on rows).
  const rows = await page.locator("#faq [data-faq]").count();
  check("nine ruled rows", rows === 9, `rows=${rows}`);
  const roundedRows = await page.evaluate(() => {
    const els = [...document.querySelectorAll("#faq [data-faq]")];
    return els.filter((el) => getComputedStyle(el).borderRadius !== "0px").length;
  });
  check("no rounded card rows", roundedRows === 0, `rounded=${roundedRows}`);

  // Colors.
  const colors = await page.evaluate(() => {
    const section = document.querySelector("#faq");
    const heading = document.querySelector("#faq h2");
    return {
      bg: getComputedStyle(section).backgroundColor,
      heading: getComputedStyle(heading).color,
    };
  });
  check("near-white surface", colors.bg === "rgb(247, 249, 252)", colors.bg);
  check("navy heading", colors.heading === "rgb(0, 21, 36)", colors.heading);

  // First question open by default; answer visible with real height.
  const expanded = await page.getAttribute("#faq-question-isolation", "aria-expanded");
  check("first question open by default", expanded === "true", expanded);
  const answerBox = await page.locator("#faq-answer-isolation").boundingBox();
  check("open answer has height", answerBox && answerBox.height > 40, `h=${answerBox?.height}`);

  // Open a middle question and verify single-open behavior in the browser.
  await page.locator("#faq-question-verify").click();
  await page.waitForTimeout(350);
  const openCount = await page.locator("#faq [data-open='true']").count();
  check("only one item open after switching", openCount === 1, `open=${openCount}`);
  const firstClosed = await page.getAttribute("#faq-question-isolation", "aria-expanded");
  check("previous item closed", firstClosed === "false", firstClosed);

  // Verify the accordion icon flips to minus when open.
  const iconState = await page.evaluate(() => {
    const row = document.querySelector("#faq [data-faq='verify']");
    const svgs = row.querySelectorAll("svg");
    const openOpacity = getComputedStyle(svgs[1]).opacity;
    return openOpacity;
  });
  check("minus visible when open", Number(iconState) === 1, `opacity=${iconState}`);

  // Anchor offset: scroll-mt-16 must keep the section clear of the fixed
  // h-16 navbar when navigating to #faq (as the navbar "Resources" link does).
  const scrollTarget = await page.evaluate(() => {
    document.getElementById("faq").scrollIntoView();
    return document.getElementById("faq").getBoundingClientRect().top;
  });
  check("section clears fixed navbar on anchor scroll", scrollTarget >= 60, `top=${scrollTarget}`);
});

// ── English 1365×768 and 1024×768 ──────────────────────────────────────────
for (const vp of [{ width: 1365, height: 768 }, { width: 1024, height: 768 }]) {
  console.log(`\nEnglish ${vp.width}×${vp.height}`);
  await withPage(vp, "en", async (page) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("no horizontal overflow", overflow <= 1, `overflow=${overflow}`);

    const list = await page.locator("#faq ul").boundingBox();
    const intro = await page.locator("#faq h2").boundingBox();
    const sideBySide = list && intro && list.x > intro.x + intro.width - 10;
    check("side-by-side intro + accordion", !!sideBySide, `intro.x=${intro?.x} list.x=${list?.x}`);
  });
}

// ── English mobile ─────────────────────────────────────────────────────────
for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 812 }]) {
  console.log(`\nEnglish mobile ${vp.width}×${vp.height}`);
  await withPage(vp, "en", async (page) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("no horizontal overflow", overflow <= 1, `overflow=${overflow}`);

    // Stacked layout: intro above, accordion below (single column).
    const intro = await page.locator("#faq h2").boundingBox();
    const list = await page.locator("#faq ul").boundingBox();
    check("stacked on mobile", list && intro && list.y > intro.y + intro.height, `intro.y=${intro?.y} list.y=${list?.y}`);

    // Question triggers are comfortable tap targets (>=44px height).
    const btn = await page.locator("#faq-question-isolation").boundingBox();
    check("touch target >= 44px", !!btn && btn.height >= 44, `h=${btn?.height}`);

    // Answers not clipped: text fully inside its row.
    const clip = await page.evaluate(() => {
      const answer = document.querySelector("#faq-answer-isolation");
      const r = answer.getBoundingClientRect();
      return r.height >= 60;
    });
    check("open answer not clipped", clip);

    // All rows fit within viewport width.
    const rowBoxes = await page.locator("#faq [data-faq]").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }),
    );
    const fits = rowBoxes.every((b) => b.left >= 0 && b.right <= vp.width + 1);
    check("all rows within viewport", fits);
  });
}

// ── Arabic ─────────────────────────────────────────────────────────────────
for (const vp of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
  console.log(`\nArabic ${vp.width}×${vp.height}`);
  await withPage(vp, "ar", async (page) => {
    const dir = await page.getAttribute("#faq", "dir");
    check("RTL direction", dir === "rtl", dir);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("no horizontal overflow", overflow <= 1, `overflow=${overflow}`);

    // Question text is Arabic.
    const q = await page.textContent("#faq-question-isolation span");
    check("Arabic question rendered", /[\\u0600-\\u06FF]/.test(q || ""), q?.slice(0, 30));

    // Expand icon sits on the INLINE-END side (mirrored in RTL): for RTL the
    // icon should be to the LEFT of the question text span.
    const iconAndText = await page.evaluate(() => {
      const row = document.querySelector("#faq [data-faq='isolation']");
      const icon = row.querySelector("button > span:last-child").getBoundingClientRect();
      const text = row.querySelector("button > span:nth-child(2)").getBoundingClientRect();
      return { iconLeft: icon.left, textLeft: text.left };
    });
    check("icon mirrored to start side in RTL", iconAndText.iconLeft < iconAndText.textLeft, JSON.stringify(iconAndText));

    // Index numbers on the right side in RTL (inline-start).
    const idx = await page.evaluate(() => {
      const row = document.querySelector("#faq [data-faq='isolation']");
      const idxEl = row.querySelector("button > span:first-child").getBoundingClientRect();
      const text = row.querySelector("button > span:nth-child(2)").getBoundingClientRect();
      return { idxLeft: idxEl.left, textLeft: text.left };
    });
    check("index on inline-start in RTL", idx.idxLeft > idx.textLeft, JSON.stringify(idx));

    // Open an Arabic middle answer and check height.
    await page.locator("#faq-question-formats").click();
    await page.waitForTimeout(350);
    const answer = await page.locator("#faq-answer-formats").boundingBox();
    check("Arabic answer opens with height", !!answer && answer.height > 40, `h=${answer?.height}`);

    // Latin product tokens intact in RTL.
    const body = await page.textContent("#faq");
    check("PDF/DOCX/TXT/OCR present in Arabic", ["PDF", "DOCX", "TXT", "OCR"].every((s) => body.includes(s)));
  });
}

// ── Reduced motion ─────────────────────────────────────────────────────────
console.log("\nReduced motion");
{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.locator("#faq").scrollIntoViewIfNeeded();
  const transitions = await page.evaluate(() => {
    const region = document.querySelector("#faq-answer-isolation");
    const btn = document.querySelector("#faq-question-isolation");
    return {
      region: getComputedStyle(region).transitionProperty,
      regionDur: getComputedStyle(region).transitionDuration,
      btnDur: getComputedStyle(btn).transitionDuration,
    };
  });
  const noneTransition = transitions.region === "none" || transitions.regionDur === "0s";
  check("no transition under reduced motion", noneTransition, JSON.stringify(transitions));
  await page.locator("#faq-question-verify").click();
  await page.waitForTimeout(100);
  const usable = await page.getAttribute("#faq-question-verify", "aria-expanded");
  check("accordion usable with animations disabled", usable === "true", usable);
  await context.close();
}

// ── Legacy FeaturesSection removed ─────────────────────────────────────────
console.log("\nLegacy FeaturesSection removed");
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

  const legacy = await page.evaluate(() => ({
    featuresGone: !document.getElementById("features"),
    faqPrev: document.getElementById("faq")?.previousElementSibling?.id ?? null,
    faqNextTag: document.getElementById("faq")?.nextElementSibling?.tagName ?? null,
    navLabels: [...document.querySelectorAll("header button")].map((b) => b.textContent.trim()),
    footerFeaturesGone: ![...document.querySelectorAll("footer a")].some((a) => a.getAttribute("href") === "#features"),
  }));
  check("legacy #features section removed", legacy.featuresGone);
  check("FAQ follows Pricing directly", legacy.faqPrev === "pricing", `prev=${legacy.faqPrev}`);
  check("Final CTA follows FAQ", legacy.faqNextTag === "SECTION", `next=${legacy.faqNextTag}`);
  check("navbar Product item removed", !legacy.navLabels.includes("Product"), legacy.navLabels.join(", "));
  check("footer #features link removed", legacy.footerFeaturesGone);
  await context.close();
}

// ── Navbar anchor preserved ────────────────────────────────────────────────
console.log("\nNavbar anchor");
{
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

  // The navbar "Resources" link targets #faq; clicking it must scroll the
  // section into view clear of the fixed navbar.
  const navButton = page.locator("header button", { hasText: "Resources" });
  check("navbar FAQ/Resources link exists", (await navButton.count()) === 1);
  await navButton.click();
  await page.waitForTimeout(300);
  const topAfterNav = await page.evaluate(() => document.getElementById("faq").getBoundingClientRect().top);
  check("navbar link scrolls FAQ clear of navbar", topAfterNav >= 60, `top=${topAfterNav}`);
  await context.close();
}

await browser.close();
console.log(failures === 0 ? "\nALL VISUAL QA CHECKS PASSED" : `\n${failures} VISUAL QA FAILURES`);
process.exit(failures === 0 ? 0 : 1);
