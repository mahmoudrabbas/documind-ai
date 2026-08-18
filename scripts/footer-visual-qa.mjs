// Programmatic visual QA for the public landing footer.
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = resolve(process.argv[2] ?? "/tmp/footer-qa");
mkdirSync(OUT, { recursive: true });
let failures = 0;

function check(name, ok, detail = "") {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

function luminance(rgb) {
  const values = rgb.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
  return values.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

const browser = await chromium.launch();
const shots = [
  ["en-desktop-1440", { width: 1440, height: 900 }, "en"],
  ["en-desktop-1365", { width: 1365, height: 768 }, "en"],
  ["en-tablet-1024", { width: 1024, height: 768 }, "en"],
  ["en-mobile-390", { width: 390, height: 844 }, "en"],
  ["en-mobile-375", { width: 375, height: 812 }, "en"],
  ["ar-desktop-1440", { width: 1440, height: 900 }, "ar"],
  ["ar-tablet-1024", { width: 1024, height: 768 }, "ar"],
  ["ar-mobile-390", { width: 390, height: 844 }, "ar"],
];

for (const [name, viewport, locale] of shots) {
  console.log(`\n${name}`);
  const context = await browser.newContext({ viewport });
  if (locale === "ar") {
    await context.addCookies([
      { name: "documind-locale", value: "ar", url: BASE },
      { name: "documind-locale-explicit", value: "1", url: BASE },
    ]);
  }
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("footer").waitFor({ state: "attached", timeout: 60000 });
  await page.evaluate(() => {
    const footer = document.querySelector("footer");
    window.scrollTo({ top: footer.offsetTop - Math.min(280, window.innerHeight * 0.3), behavior: "instant" });
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });

  const result = await page.evaluate(() => {
    const footer = document.querySelector("footer");
    const cta = document.getElementById("get-started");
    const logo = footer.querySelector('a[href="/"]');
    const navs = [...footer.querySelectorAll("nav")];
    const links = [...footer.querySelectorAll("a")];
    const product = navs[0];
    const access = navs[1];
    const css = (el) => getComputedStyle(el);
    const footerBox = footer.getBoundingClientRect();
    const productBox = product.getBoundingClientRect();
    const accessBox = access.getBoundingClientRect();
    return {
      dir: footer.getAttribute("dir"),
      footerBg: css(footer).backgroundColor,
      ctaBg: css(cta).backgroundColor,
      borderTop: parseFloat(css(footer).borderTopWidth),
      touchesCta: Math.abs(footer.offsetTop - (cta.offsetTop + cta.offsetHeight)) <= 1,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      hrefs: links.map((link) => link.getAttribute("href")),
      text: footer.textContent,
      navCount: navs.length,
      brandBeforeNavigation: Boolean(logo.compareDocumentPosition(product) & Node.DOCUMENT_POSITION_FOLLOWING),
      brandTop: logo.getBoundingClientRect().top,
      productTop: productBox.top,
      groupsSideBySide: Math.abs(productBox.top - accessBox.top) <= 2,
      groupsStacked: accessBox.top >= productBox.bottom,
      footerHeight: footerBox.height,
      maxNavLinkSize: Math.max(...[...footer.querySelectorAll("nav a")].map((link) => parseFloat(css(link).fontSize))),
    };
  });

  const expectedDir = locale === "ar" ? "rtl" : "ltr";
  check("correct locale direction", result.dir === expectedDir, result.dir);
  check("footer directly follows the final CTA", result.touchesCta);
  check("footer is darker/quieter than the CTA", luminance(result.footerBg) < luminance(result.ctaBg), `${result.footerBg} vs ${result.ctaBg}`);
  check("subtle top boundary present", result.borderTop === 1, `${result.borderTop}px`);
  check("no horizontal overflow", result.overflow <= 1, `overflow=${result.overflow}`);
  check("two navigation landmarks", result.navCount === 2, `count=${result.navCount}`);
  check("brand precedes navigation in the DOM", result.brandBeforeNavigation);
  check("footer navigation typography remains compact", result.maxNavLinkSize <= 14, `max=${result.maxNavLinkSize}`);
  check("no placeholder link", !result.hrefs.includes("#"), JSON.stringify(result.hrefs));
  check("verified destination set only", JSON.stringify(result.hrefs) === JSON.stringify(["/", "#how-it-works", "#security", "#pricing", "#faq", "/register", "/login"]), JSON.stringify(result.hrefs));
  check("legacy company/legal labels absent", !/About|Blog|Careers|Contact|Privacy Policy|Terms of Service/.test(result.text));
  check("current DocuMind AI copyright", result.text.includes("DocuMind AI") && !result.text.includes("Intelligence Systems"));
  if (viewport.width >= 1024) {
    check("brand and navigation share the desktop row", Math.abs(result.brandTop - result.productTop) <= 2);
    check("navigation groups remain side by side", result.groupsSideBySide);
  } else if (viewport.width >= 640) {
    check("navigation groups remain side by side", result.groupsSideBySide);
  } else {
    check("navigation groups stack cleanly", result.groupsStacked);
  }

  await context.close();
}

await browser.close();
if (failures) {
  console.error(`\n${failures} FOOTER QA CHECK(S) FAILED`);
  process.exit(1);
}
console.log("\nALL FOOTER QA CHECKS PASSED");
