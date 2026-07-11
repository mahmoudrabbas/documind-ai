"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/providers/i18n-provider";
import { LanguageSwitcher } from "@/components/ui";
import { cn } from "@/lib/utils";

function PublicNavbar() {
  const { t, dir } = useI18n();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header className="fixed top-0 right-0 left-0 z-50 border-b border-white/10 bg-primary/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-on-primary no-underline">
          <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            neurology
          </span>
          <span className="text-title-lg font-bold tracking-tight">
            {t("landing.appName")}
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" dir={dir}>
          <button onClick={() => scrollTo("features")} className="text-body-sm text-on-primary/80 transition-colors hover:text-on-primary">
            {t("landing.navFeatures")}
          </button>
          <button onClick={() => scrollTo("pricing")} className="text-body-sm text-on-primary/80 transition-colors hover:text-on-primary">
            {t("landing.navPricing")}
          </button>
          <button onClick={() => scrollTo("security")} className="text-body-sm text-on-primary/80 transition-colors hover:text-on-primary">
            {t("landing.navSecurity")}
          </button>
          <button onClick={() => scrollTo("faq")} className="text-body-sm text-on-primary/80 transition-colors hover:text-on-primary">
            {t("landing.navFaq")}
          </button>
          <LanguageSwitcher className="border-on-primary/20 bg-primary-container/50 text-on-primary hover:bg-primary-container" />
          <Link
            href="/login"
            className="rounded-lg border border-on-primary/20 px-4 py-1.5 text-label-md text-on-primary/90 transition-colors hover:bg-on-primary/10"
          >
            {t("landing.navSignIn")}
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-on-primary px-4 py-1.5 text-label-md font-semibold text-primary transition-all hover:opacity-90"
          >
            {t("landing.navGetStarted")}
          </Link>
        </nav>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex items-center justify-center rounded-lg p-2 text-on-primary md:hidden"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          <span className="material-symbols-outlined">
            {mobileMenuOpen ? "close" : "menu"}
          </span>
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-white/10 bg-primary md:hidden">
          <div className="flex flex-col gap-2 px-4 py-4" dir={dir}>
            <button onClick={() => scrollTo("features")} className="rounded-lg px-3 py-2 text-left text-body-sm text-on-primary/80 transition-colors hover:bg-white/10">
              {t("landing.navFeatures")}
            </button>
            <button onClick={() => scrollTo("pricing")} className="rounded-lg px-3 py-2 text-left text-body-sm text-on-primary/80 transition-colors hover:bg-white/10">
              {t("landing.navPricing")}
            </button>
            <button onClick={() => scrollTo("security")} className="rounded-lg px-3 py-2 text-left text-body-sm text-on-primary/80 transition-colors hover:bg-white/10">
              {t("landing.navSecurity")}
            </button>
            <button onClick={() => scrollTo("faq")} className="rounded-lg px-3 py-2 text-left text-body-sm text-on-primary/80 transition-colors hover:bg-white/10">
              {t("landing.navFaq")}
            </button>
            <LanguageSwitcher />
            <Link href="/login" className="rounded-lg border border-on-primary/20 px-3 py-2 text-center text-label-md text-on-primary/90 transition-colors hover:bg-on-primary/10">
              {t("landing.navSignIn")}
            </Link>
            <Link href="/register" className="rounded-lg bg-on-primary px-3 py-2 text-center text-label-md font-semibold text-primary transition-all hover:opacity-90">
              {t("landing.navGetStarted")}
            </Link>
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
    <footer className="border-t border-white/10 bg-primary" dir={dir}>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-2xl text-on-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                neurology
              </span>
              <span className="text-title-lg font-bold text-on-primary">
                {t("landing.appName")}
              </span>
            </div>
            <p className="mt-4 max-w-xs text-body-sm text-on-primary/60">
              {t("landing.footerTagline")}
            </p>
          </div>

          <div>
            <h4 className="text-label-sm font-semibold uppercase tracking-wider text-on-primary/50">
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
                  <a href={item.href} className="text-body-sm text-on-primary/70 transition-colors hover:text-on-primary">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-label-sm font-semibold uppercase tracking-wider text-on-primary/50">
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
                  <a href={item.href} className="text-body-sm text-on-primary/70 transition-colors hover:text-on-primary">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-label-sm font-semibold uppercase tracking-wider text-on-primary/50">
              {t("landing.footerLegal")}
            </h4>
            <ul className="mt-4 space-y-3">
              {[
                { label: t("landing.footerLegalPrivacy"), href: "#" },
                { label: t("landing.footerLegalTerms"), href: "#" },
              ].map((item, i) => (
                <li key={`legal-${i}`}>
                  <a href={item.href} className="text-body-sm text-on-primary/70 transition-colors hover:text-on-primary">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-8 text-center">
          <p className="text-body-sm text-on-primary/50">
            &copy; {year} {t("landing.footerCopyright")}
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
