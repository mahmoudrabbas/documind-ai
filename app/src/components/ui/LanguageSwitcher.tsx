"use client";

/**
 * LanguageSwitcher — accessible locale toggle button.
 *
 * Cycles through the supported locales on click, showing the current
 * locale's short code (e.g. "EN", "AR") with a globe icon.
 */

import { useI18n } from "@/providers/i18n-provider";
import { SUPPORTED_LOCALES, LOCALE_CONFIGS } from "@/lib/i18n/i18n.config";
import type { Locale } from "@/lib/i18n/i18n.types";
import { cn } from "@/lib/utils";

export interface LanguageSwitcherProps {
  /** Additional CSS class names for the root button element. */
  className?: string;
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useI18n();

  const currentIndex = SUPPORTED_LOCALES.indexOf(locale);
  const nextLocale: Locale =
    SUPPORTED_LOCALES[(currentIndex + 1) % SUPPORTED_LOCALES.length];

  const currentConfig = LOCALE_CONFIGS[locale];
  const nextConfig = LOCALE_CONFIGS[nextLocale];

  return (
    <button
      type="button"
      onClick={() => setLocale(nextLocale)}
      aria-label={`${t("nav.language")}: ${currentConfig.nativeLabel} → ${nextConfig.nativeLabel}`}
      title={`${t("nav.language")}: ${currentConfig.nativeLabel} → ${nextConfig.nativeLabel}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5",
        "text-label-md font-medium text-on-surface-variant",
        "transition-all duration-200 ease-in-out",
        "hover:bg-surface-container hover:text-on-surface hover:border-outline",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary",
        "active:scale-95",
        className,
      )}
    >
      {/* Globe icon (heroicons outline) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="h-4 w-4 shrink-0"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A11.978 11.978 0 0 1 12 16.5a11.978 11.978 0 0 1-8.716-3.747m0 0A8.96 8.96 0 0 1 3 12c0-.778.099-1.533.284-2.253"
        />
      </svg>

      <span className="uppercase tracking-wide">
        {locale.toUpperCase()}
      </span>
    </button>
  );
}
