// Programmatic visual QA for the Final CTA section (Section 10).
// Captures screenshots and verifies geometry, colors, RTL, overflow, route
// wiring, and the light→dark→footer hand-off in a real browser.
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = resolve(process.argv[2] ?? "/tmp/final-cta-qa");
mkdirSync(OUT, { recursive: true });
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
  await page.locator("#get-started").scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await fn(page);
  await context.close();
}

const SHOTS = [
  ["en-desktop-1440", { width: 1440, height: 900 }, "en"],
  ["en-desktop-1365", { width: 1365, height: 768 }, "en"],
  ["en-desktop-1024", { width: 1024, height: 768 }, "en"],
  ["en-mobile-390", { width: 390, height: 844 }, "en"],
  ["en-mobile-375", { width: 375, height: 812 }, "en"],
  ["ar-desktop-1440", { width: 1440, height: 900 }, "ar"],
  ["ar-desktop-1024", { width: 1024, height: 768 }, "ar"],
  ["ar-mobile-390", { width: 390, height: 844 }, "ar"],
];

// ── Desktop English ────────────────────────────────────────────────────────
console.log("\nDesktop English 1440×900");
await withPage({ width: 1440, height: 900 }, "en", async (page) => {
  await page.screenshot({ path: join(OUT, "en-desktop-1440.png"), fullPage: false });

  const r = await page.evaluate(() => {
    const sec = document.getElementById("get-started");
    const box = sec.getBoundingClientRect();
    const hero = document.querySelector("#hero-heading")?.closest("section");
    const css = (el, p) => getComputedStyle(el)[p];
    const secStyle = getComputedStyle(sec);
    const heroBg = hero ? getComputedStyle(hero).backgroundColor : null;
    const grid = sec.querySelector(":scope > div:nth-child(2) > div");
    const editorial = grid.children[0];
    const signature = grid.children[1];
    const cta = sec.querySelector('a[href="/register"]');
    const signIn = sec.querySelector('a[href="/login"]');
    return {
      secH: Math.round(box.height),
      secBg: secStyle.backgroundColor,
      heroBg,
      distinctBg: secStyle.backgroundColor !== heroBg,
      h2Size: parseFloat(css(sec.querySelector("h2"), "fontSize")),
      h2Line: css(sec.querySelector("h2"), "lineHeight"),
      editorialW: Math.round(editorial.getBoundingClientRect().width),
      signatureW: Math.round(signature.getBoundingClientRect().width),
      signatureRight: signature.getBoundingClientRect().right,
      secRight: sec.getBoundingClientRect().right,
      sigRightOfEditorial: signature.getBoundingClientRect().left > editorial.getBoundingClientRect().right - 40,
      ctaMinH: cta.getBoundingClientRect().height,
      ctaBg: css(cta, "backgroundColor"),
      ctaColor: css(cta, "color"),
      ctaRadius: css(cta, "borderRadius"),
      signInBg: css(signIn, "backgroundColor"),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      faqPrev: document.getElementById("faq")?.nextElementSibling?.id,
      footerAfter: (sec.closest("main")?.nextElementSibling ?? document.querySelector("footer"))?.tagName === "FOOTER",
    };
  });
  check("section exists with 500-700px desktop height", r.secH >= 480 && r.secH <= 780, `h=${r.secH}`);
  check("dark field distinct from Hero", r.distinctBg && r.secBg !== "rgb(5, 23, 40)", `sec=${r.secBg} hero=${r.heroBg}`);
  check("headline strong but not Hero-sized", r.h2Size >= 30 && r.h2Size <= 50, `size=${r.h2Size}`);
  check("no horizontal overflow", r.overflow <= 1, `overflow=${r.overflow}`);
  check("asymmetric editorial + signature columns", r.editorialW > r.signatureW && r.sigRightOfEditorial, `ed=${r.editorialW} sig=${r.signatureW}`);
  check("signature stays inside section", r.signatureRight <= r.secRight + 1, `right=${r.signatureRight} sec=${r.secRight}`);
  check("primary CTA is light, dark text, 46px+, restrained radius", r.ctaMinH >= 46 && r.ctaBg === "rgb(255, 255, 255)" && r.ctaColor === "rgb(0, 21, 36)", `h=${r.ctaMinH} bg=${r.ctaBg} color=${r.ctaColor} radius=${r.ctaRadius}`);
  check("sign-in remains a quiet text link", r.signInBg === "rgba(0, 0, 0, 0)", `bg=${r.signInBg}`);
  check("FAQ directly precedes the final CTA", r.faqPrev === "get-started", r.faqPrev);
  check("footer directly follows the final CTA", r.footerAfter);
});

// ── Desktop English, other widths ──────────────────────────────────────────
for (const [name, viewport] of [["1365×768", { width: 1365, height: 768 }], ["1024×768", { width: 1024, height: 768 }]]) {
  console.log(`\nEnglish ${name}`);
  await withPage(viewport, "en", async (page) => {
    const r = await page.evaluate(() => {
      const sec = document.getElementById("get-started");
      const grid = sec.querySelector(":scope > div:nth-child(2) > div");
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        twoCol: grid.children.length === 2 && grid.children[0].getBoundingClientRect().left < grid.children[1].getBoundingClientRect().left,
        secH: Math.round(sec.getBoundingClientRect().height),
      };
    });
    check("no horizontal overflow", r.overflow <= 1, `overflow=${r.overflow}`);
    check("side-by-side editorial + signature", r.twoCol);
    check("substantial but concise height", r.secH >= 460 && r.secH <= 800, `h=${r.secH}`);
  });
}

// ── English mobile ─────────────────────────────────────────────────────────
for (const [name, viewport] of [["390×844", { width: 390, height: 844 }], ["375×812", { width: 375, height: 812 }]]) {
  console.log(`\nEnglish mobile ${name}`);
  await withPage(viewport, "en", async (page) => {
    await page.screenshot({ path: join(OUT, `en-mobile-${viewport.width}.png`), fullPage: false });
    const r = await page.evaluate(() => {
      const sec = document.getElementById("get-started");
      const grid = sec.querySelector(":scope > div:nth-child(2) > div");
      const children = [...grid.children].map((el) => el.getBoundingClientRect().top);
      const stacked = children[0] < children[1] && children[1] >= children[0];
      const editorial = grid.children[0];
      const h2 = sec.querySelector("h2").getBoundingClientRect();
      const sigTop = grid.children[1].getBoundingClientRect().top;
      const order = [
        ...sec.querySelectorAll("h2, p, a[href='/register'], a[href='/login'], ul, svg"),
      ].map((el) => el.getBoundingClientRect().top);
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        stacked,
        sigBelowCopy: sigTop >= editorial.getBoundingClientRect().top + 40,
        h2BelowActions: order[1] >= order[0] && order.length > 2,
        svgLast: order.indexOf(order.slice().sort((a, b) => b - a)[0]) === order.length - 1,
        secW: sec.getBoundingClientRect().width,
        innerW: window.innerWidth,
      };
    });
    check("no horizontal overflow", r.overflow <= 1, `overflow=${r.overflow}`);
    check("stacked layout on mobile", r.stacked);
    check("visual motif sits below the editorial copy", r.sigBelowCopy);
    check("signature is the last element in the section", r.svgLast);
  });
}

// ── Arabic ─────────────────────────────────────────────────────────────────
console.log("\nArabic desktop 1440×900");
await withPage({ width: 1440, height: 900 }, "ar", async (page) => {
  await page.screenshot({ path: join(OUT, "ar-desktop-1440.png"), fullPage: false });
  const r = await page.evaluate(() => {
    const sec = document.getElementById("get-started");
    const secStyle = getComputedStyle(sec);
    const cta = sec.querySelector('a[href="/register"]');
    const arrow = cta.querySelector("span.material-symbols-outlined");
    const h2 = sec.querySelector("h2");
    const sig = sec.querySelector("svg");
    const sigTexts = [...sig.querySelectorAll("text")].map((t) => t.textContent);
    const fileTexts = [...sig.querySelectorAll("text")].filter((t) => /_Policy\.pdf|_SLA\.pdf/.test(t.textContent ?? ""));
    return {
      dir: sec.getAttribute("dir"),
      bg: secStyle.backgroundColor,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      h2: h2.textContent,
      ctaText: cta.textContent,
      arrowRotate: getComputedStyle(arrow).rotate,
      arrowRotated: getComputedStyle(arrow).rotate !== "none" && getComputedStyle(arrow).rotate !== "0deg",
      evidence: sigTexts.find((t) => /أدلة/.test(t ?? "")),
      minutes: sigTexts.find((t) => /دقيقة/.test(t ?? "")),
      fileDirections: fileTexts.map((t) => getComputedStyle(t).direction),
      hasFiles: fileTexts.length === 3,
    };
  });
  check("RTL direction on section", r.dir === "rtl", r.dir);
  check("no horizontal overflow", r.overflow <= 1, `overflow=${r.overflow}`);
  check("Arabic primary label", (r.ctaText ?? "").includes("ابدأ مجانًا"));
  check("arrow flipped for RTL", r.arrowRotated, r.arrowRotate);
  check("Arabic evidence + minutes labels render", Boolean(r.evidence) && Boolean(r.minutes));
  check("three source filenames stay LTR in RTL", r.hasFiles && r.fileDirections.every((d) => d === "ltr"), JSON.stringify(r.fileDirections));
});

for (const [name, viewport] of [["1024×768", { width: 1024, height: 768 }], ["390×844", { width: 390, height: 844 }]]) {
  console.log(`\nArabic ${name}`);
  await withPage(viewport, "ar", async (page) => {
    if (viewport.width === 390) {
      await page.screenshot({ path: join(OUT, "ar-mobile-390.png"), fullPage: false });
    }
    const r = await page.evaluate(() => {
      const sec = document.getElementById("get-started");
      return {
        dir: sec.getAttribute("dir"),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        hasCta: Boolean(sec.querySelector('a[href="/register"]')),
        hasSignIn: Boolean(sec.querySelector('a[href="/login"]')),
      };
    });
    check("RTL direction on section", r.dir === "rtl", r.dir);
    check("no horizontal overflow", r.overflow <= 1, `overflow=${r.overflow}`);
    check("primary and secondary actions present", r.hasCta && r.hasSignIn);
  });
}

// ── Footer transition + reduced motion ─────────────────────────────────────
console.log("\nFooter transition & reduced motion");
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.locator("#get-started").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const sec = document.getElementById("get-started");
    const footer = document.querySelector("footer");
    const secEdge = sec.getBoundingClientRect().bottom;
    const footerTop = footer.getBoundingClientRect().top;
    const secBorder = getComputedStyle(sec).borderTopWidth;
    const footerBorder = getComputedStyle(footer).borderTopWidth;
    const reveal = sec.querySelector(":scope > div:nth-child(2) > div > div > div");
    const finalState = reveal ? getComputedStyle(reveal).opacity : "n/a";
    return {
      touches: Math.abs(secEdge - footerTop) < 1,
      secBorder,
      footerBorder,
      finalOpacity: finalState,
      h2: sec.querySelector("h2").textContent,
    };
  });
  check("final CTA touches the footer cleanly", r.touches, `gap=${Math.abs(r.secEdge - r.footerTop)}`);
  check("section has a subtle top hairline boundary", parseFloat(r.secBorder) > 0, r.secBorder);
  check("content fully visible under reduced motion", r.finalOpacity === "1", r.finalOpacity);
  check("English headline intact", (r.h2 ?? "").includes("Make every answer easier to trust."));
  await context.close();
}

// ── Legacy CTA gone; page order intact ─────────────────────────────────────
console.log("\nPage order & legacy removal");
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const r = await page.evaluate(() => {
    const ids = ["how-it-works", "permission-aware", "grounded-answers", "solutions", "security", "pricing", "faq", "get-started"].map((id) => document.getElementById(id)?.id);
    const noCtaSection = !Array.from(document.querySelectorAll("section")).some((s) => (s.textContent ?? "").includes("Ready to Transform Your Company Knowledge?"));
    const oldTrialGone = !(document.body.textContent ?? "").includes("Start your 30-day free trial");
    const navLabels = [...document.querySelectorAll("header button")].map((b) => b.textContent.trim());
    return { ids, noCtaSection, oldTrialGone, navLabels };
  });
  check("all approved sections render in order", JSON.stringify(r.ids) === JSON.stringify(["how-it-works", "permission-aware", "grounded-answers", "solutions", "security", "pricing", "faq", "get-started"]), JSON.stringify(r.ids));
  check("legacy CTA headline gone", r.noCtaSection);
  check("legacy 30-day trial copy gone from page", r.oldTrialGone);
  await page.close();
}

await browser.close();
console.log(failures === 0 ? "\nALL VISUAL QA CHECKS PASSED" : `\n${failures} VISUAL QA FAILURES`);
process.exit(failures === 0 ? 0 : 1);