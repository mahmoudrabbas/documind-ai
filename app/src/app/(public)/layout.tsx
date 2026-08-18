"use client";

import { useI18n } from "@/providers/i18n-provider";
import { DocuMindLogo } from "@/components/brand/DocuMindLogo";
import { PublicNavbar } from "@/components/marketing/PublicNavbar";

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
