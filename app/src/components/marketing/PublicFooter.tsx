"use client";

import Link from "next/link";
import { DocuMindLogo } from "@/components/brand/DocuMindLogo";
import { useI18n } from "@/providers/i18n-provider";

const productLinks = [
  { key: "landing.footerProductHowItWorks", href: "#how-it-works" },
  { key: "landing.footerProductSecurity", href: "#security" },
  { key: "landing.footerProductPricing", href: "#pricing" },
  { key: "landing.footerProductFaq", href: "#faq" },
] as const;

export function PublicFooter() {
  const { t, dir } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer
      dir={dir}
      className="border-t border-white/[0.08] bg-[#02050a] px-6 text-white"
    >
      <div className="mx-auto grid w-full max-w-[1400px] gap-12 py-14 sm:px-2 sm:py-16 lg:grid-cols-2 lg:gap-16">
        <div className="max-w-md">
          <Link
            href="/"
            aria-label={t("landing.appName")}
            className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1688f5]"
          >
            <DocuMindLogo variant="full" tone="on-primary" />
          </Link>
          <p className="mt-5 max-w-xs text-body-sm leading-[1.65] text-white/55">
            {t("landing.footerStatement")}
          </p>
        </div>

        <div className="grid gap-10 sm:grid-cols-2 sm:gap-12">
          <nav aria-label={t("landing.footerProduct")}>
            <p className="text-label-sm font-semibold uppercase text-white/45">
              {t("landing.footerProduct")}
            </p>
            <ul className="mt-4 space-y-3">
              {productLinks.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-body-sm text-white/60 transition-colors hover:text-[#1688f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1688f5]"
                  >
                    {t(item.key)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={t("landing.footerAccess")}>
            <p className="text-label-sm font-semibold uppercase text-white/45">
              {t("landing.footerAccess")}
            </p>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href="/register"
                  className="text-body-sm text-white/60 transition-colors hover:text-[#1688f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1688f5]"
                >
                  {t("landing.finalCtaPrimary")}
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="text-body-sm text-white/60 transition-colors hover:text-[#1688f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1688f5]"
                >
                  {t("landing.finalCtaSecondary")}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2 border-t border-white/[0.08] py-6 text-start sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-xs text-white/40">
          {t("landing.footerCopyright", { year: String(year) })}
        </p>
      </div>
    </footer>
  );
}
