"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/providers/i18n-provider";
import { LanguageSwitcher } from "@/components/ui";
import { DocuMindLogo } from "@/components/brand/DocuMindLogo";

function PublicNavbar() {
  const { t, dir } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-white/10 bg-primary/85 backdrop-blur-xl shadow-lg shadow-black/10 transition-all duration-300">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="no-underline transition-transform hover:scale-[1.02] active:scale-95">
          <DocuMindLogo variant="full" tone="on-primary" />
        </Link>

        <nav className="hidden items-center gap-6 lg:gap-8 md:flex" dir={dir}>
          <button
            onClick={() => scrollTo("features")}
            className="rounded-lg px-2.5 py-1.5 text-label-md text-on-primary/80 transition-all hover:bg-white/10 hover:text-on-primary"
          >
            {t("landing.navFeatures")}
          </button>
          <button
            onClick={() => scrollTo("pricing")}
            className="rounded-lg px-2.5 py-1.5 text-label-md text-on-primary/80 transition-all hover:bg-white/10 hover:text-on-primary"
          >
            {t("landing.navPricing")}
          </button>
          <button
            onClick={() => scrollTo("security")}
            className="rounded-lg px-2.5 py-1.5 text-label-md text-on-primary/80 transition-all hover:bg-white/10 hover:text-on-primary"
          >
            {t("landing.navSecurity")}
          </button>
          <button
            onClick={() => scrollTo("faq")}
            className="rounded-lg px-2.5 py-1.5 text-label-md text-on-primary/80 transition-all hover:bg-white/10 hover:text-on-primary"
          >
            {t("landing.navFaq")}
          </button>

          <LanguageSwitcher className="border-on-primary/20 bg-white/10 text-on-primary hover:bg-white/15 backdrop-blur-sm shadow-sm" />

          <Link
            href="/login"
            className="rounded-xl border border-on-primary/25 bg-white/5 px-4 py-2 text-label-md font-semibold text-on-primary shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-white/15 hover:border-on-primary/40 active:scale-95"
          >
            {t("landing.navSignIn")}
          </Link>

          <Link
            href="/register"
            className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-xl bg-white px-5 py-2 text-label-md font-bold text-primary shadow-md shadow-white/15 transition-all duration-200 hover:bg-slate-100 hover:scale-[1.02] active:scale-95"
          >
            <span>{t("landing.navGetStarted")}</span>
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[16px] transition-transform duration-200 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
            >
              arrow_forward
            </span>
          </Link>
        </nav>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex items-center justify-center rounded-xl p-2.5 text-on-primary transition-colors hover:bg-white/10 md:hidden"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          <span className="material-symbols-outlined text-[24px]">
            {mobileMenuOpen ? "close" : "menu"}
          </span>
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-white/10 bg-primary/95 backdrop-blur-2xl md:hidden animate-fade-in">
          <div className="flex flex-col gap-2 px-4 py-5" dir={dir}>
            <button
              onClick={() => scrollTo("features")}
              className="rounded-xl px-4 py-2.5 text-start text-label-lg text-on-primary/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              {t("landing.navFeatures")}
            </button>
            <button
              onClick={() => scrollTo("pricing")}
              className="rounded-xl px-4 py-2.5 text-start text-label-lg text-on-primary/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              {t("landing.navPricing")}
            </button>
            <button
              onClick={() => scrollTo("security")}
              className="rounded-xl px-4 py-2.5 text-start text-label-lg text-on-primary/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              {t("landing.navSecurity")}
            </button>
            <button
              onClick={() => scrollTo("faq")}
              className="rounded-xl px-4 py-2.5 text-start text-label-lg text-on-primary/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              {t("landing.navFaq")}
            </button>

            <div className="my-2 border-t border-white/10 pt-3 flex flex-col gap-3">
              <LanguageSwitcher className="w-full justify-between border-on-primary/20 bg-white/10 text-on-primary hover:bg-white/15" />
              <Link
                href="/login"
                className="rounded-xl border border-on-primary/20 bg-white/5 py-2.5 text-center text-label-md font-semibold text-on-primary transition-colors hover:bg-white/15"
              >
                {t("landing.navSignIn")}
              </Link>
              <Link
                href="/register"
                className="rounded-xl bg-white py-2.5 text-center text-label-md font-bold text-primary shadow-md transition-all hover:bg-slate-100"
              >
                {t("landing.navGetStarted")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function PublicFooter() {
  const { t, dir } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-white/10 bg-gradient-to-b from-primary via-primary to-slate-950 text-white" dir={dir}>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <DocuMindLogo variant="full" tone="on-primary" />
            <p className="mt-4 max-w-xs text-body-sm leading-relaxed text-on-primary/70">
              {t("landing.footerTagline")}
            </p>
          </div>

          <div>
            <h4 className="text-label-sm font-bold uppercase text-on-primary/50">
              {t("landing.footerProduct")}
            </h4>
            <ul className="mt-4 space-y-3">
              {[
                { label: t("landing.footerProductFeatures"), href: "#features" },
                { label: t("landing.footerProductPricing"), href: "#pricing" },
                { label: t("landing.footerProductSecurity"), href: "#security" },
                { label: t("landing.footerProductFaq"), href: "#faq" },
              ].map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="text-body-sm text-on-primary/70 transition-colors hover:text-white">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-label-sm font-bold uppercase text-on-primary/50">
              {t("landing.footerCompany")}
            </h4>
            <ul className="mt-4 space-y-3">
              {[
                { label: t("landing.footerCompanyAbout"), href: "#" },
                { label: t("landing.footerCompanyBlog"), href: "#" },
                { label: t("landing.footerCompanyCareers"), href: "#" },
                { label: t("landing.footerCompanyContact"), href: "#" },
              ].map((item, i) => (
                <li key={`company-${i}`}>
                  <a href={item.href} className="text-body-sm text-on-primary/70 transition-colors hover:text-white">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-label-sm font-bold uppercase text-on-primary/50">
              {t("landing.footerLegal")}
            </h4>
            <ul className="mt-4 space-y-3">
              {[
                { label: t("landing.footerLegalPrivacy"), href: "#" },
                { label: t("landing.footerLegalTerms"), href: "#" },
              ].map((item, i) => (
                <li key={`legal-${i}`}>
                  <a href={item.href} className="text-body-sm text-on-primary/70 transition-colors hover:text-white">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-14 border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-body-sm text-on-primary/50 text-center sm:text-start">
            &copy; {year} {t("landing.footerCopyright")}
          </p>
          <p className="text-label-xs text-on-primary/40">
            {t("landing.tagline")}
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicNavbar />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
