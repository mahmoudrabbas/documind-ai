"use client";

/**
 * Public marketing navbar.
 *
 * Integrated into the dark hero at the top of the page (transparent), then
 * gains a subtle semi-opaque dark surface + hairline on scroll so links stay
 * readable when light sections pass underneath. Full desktop link row from
 * ≥1120px; below that a menu button with a panel (large touch targets).
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/providers/i18n-provider";
import { LanguageSwitcher } from "@/components/ui";
import { DocuMindLogo } from "@/components/brand/DocuMindLogo";
import { cn } from "@/lib/utils";

/**
 * Nav labels point at the sections that exist today. When the remaining
 * homepage sections are redesigned, update the target ids (not the copy).
 */
const NAV_LINKS = [
  { id: "how-it-works", key: "landing.navSolutions" },
  { id: "security", key: "landing.navSecurity" },
  { id: "pricing", key: "landing.navPricing" },
  { id: "faq", key: "landing.navResources" },
];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function PublicNavbar() {
  const { t, dir } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileMenuOpen]);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  };

  const linkClasses =
    "rounded-lg px-3 py-2 text-label-md font-medium text-on-primary/80 transition-colors duration-150 hover:bg-white/10 hover:text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary";

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-all duration-300",
        scrolled
          ? "border-white/10 bg-primary/85 shadow-lg shadow-black/10 backdrop-blur-xl"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label={`${t("landing.appName")} — home`}
          className="shrink-0 rounded-lg transition-transform duration-200 hover:scale-[1.02] active:scale-95"
        >
          <DocuMindLogo variant="full" tone="on-primary" />
        </Link>

        {/* desktop links */}
        <nav className="hidden items-center gap-1 min-[1120px]:flex" dir={dir} aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <button key={link.id} type="button" onClick={() => scrollTo(link.id)} className={linkClasses}>
              {t(link.key)}
            </button>
          ))}
        </nav>

        {/* desktop actions */}
        <div className="hidden items-center gap-3 min-[1120px]:flex">
          <LanguageSwitcher className="border-on-primary/20 bg-white/10 text-on-primary hover:bg-white/15" />
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-label-md font-medium text-on-primary/80 transition-colors duration-150 hover:text-on-primary"
          >
            {t("landing.navSignIn")}
          </Link>
          <Link
            href="/register"
            className="group inline-flex items-center gap-1.5 rounded-lg bg-on-primary px-5 py-2.5 text-label-md font-semibold text-primary shadow-md shadow-black/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#e5f2ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary active:scale-[0.98] motion-reduce:transform-none"
          >
            {t("landing.navStartFree")}
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[16px] transition-transform duration-200 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
            >
              arrow_forward
            </span>
          </Link>
        </div>

        {/* mobile menu toggle */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          ref={menuButtonRef}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-on-primary transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary min-[1120px]:hidden"
          aria-label={mobileMenuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
          aria-expanded={mobileMenuOpen}
          aria-controls="public-nav-mobile-menu"
        >
          <span className="material-symbols-outlined text-[24px]">
            {mobileMenuOpen ? "close" : "menu"}
          </span>
        </button>
      </div>

      {mobileMenuOpen && (
        <div
          id="public-nav-mobile-menu"
          className="border-t border-white/10 bg-primary/95 backdrop-blur-2xl min-[1120px]:hidden"
        >
          <div className="flex flex-col gap-1 px-4 py-4" dir={dir}>
            {NAV_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => scrollTo(link.id)}
                className="rounded-xl px-4 py-3 text-start text-label-lg text-on-primary/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                {t(link.key)}
              </button>
            ))}

            <div className="my-2 flex flex-col gap-3 border-t border-white/10 pt-4">
              <LanguageSwitcher className="w-full justify-between border-on-primary/20 bg-white/10 text-on-primary hover:bg-white/15" />
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-xl border border-on-primary/20 bg-white/5 py-3 text-center text-label-md font-semibold text-on-primary transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                {t("landing.navSignIn")}
              </Link>
              <Link
                href="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-xl bg-on-primary py-3 text-center text-label-md font-bold text-primary shadow-md transition-colors hover:bg-[#e5f2ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                {t("landing.navStartFree")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
