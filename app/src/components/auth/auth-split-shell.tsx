import Link from "next/link";
import type { ReactNode } from "react";
import { DocuMindLogo } from "@/components/brand/DocuMindLogo";
import { AuthHeroPanel, LanguageSwitcher } from "@/components/ui";

type AuthSplitShellProps = {
  children: ReactNode;
  description: string;
  dir: "ltr" | "rtl";
  backToHomeLabel: string;
  securityLabel: string;
  rightsLabel: string;
  variant?: "login" | "register";
  showBackToHome?: boolean;
};

export function AuthSplitShell({
  children,
  description,
  dir,
  backToHomeLabel,
  securityLabel,
  rightsLabel,
  variant = "login",
  showBackToHome = true,
}: AuthSplitShellProps) {
  const panelWidth =
    variant === "register"
      ? "lg:w-[min(56vw,44rem)]"
      : "lg:w-[min(46vw,35rem)]";
  const contentWidth = variant === "register" ? "max-w-2xl" : "max-w-md";

  return (
    <main
      dir={dir}
      data-auth-shell
      className="flex min-h-dvh w-full min-w-0 flex-col overflow-x-hidden bg-surface-container-lowest lg:h-dvh lg:min-h-0 lg:flex-row lg:overflow-hidden"
    >
      <section
        data-auth-form-panel
        className={`relative z-10 flex min-h-dvh w-full min-w-0 shrink-0 flex-col border-outline-variant px-lg py-[clamp(1.25rem,4dvh,3rem)] md:px-xl lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-e lg:px-[clamp(2rem,3vw,3rem)] ${panelWidth}`}
      >
        <div
          className={`mx-auto flex min-h-full w-full flex-1 flex-col justify-center ${contentWidth}`}
        >
          <header className="mb-[clamp(1.25rem,3dvh,2rem)] shrink-0">
            <div className="mb-[clamp(0.75rem,2dvh,1.5rem)] flex min-w-0 items-center justify-between gap-md">
              {showBackToHome ? (
                <Link
                  href="/"
                  aria-label={backToHomeLabel}
                  className="inline-flex min-w-0 items-center gap-xs text-label-md font-semibold text-primary transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                >
                  <span
                    className="material-symbols-outlined shrink-0 text-lg rtl:rotate-180"
                    aria-hidden="true"
                  >
                    arrow_back
                  </span>
                  <span className="truncate">{backToHomeLabel}</span>
                </Link>
              ) : null}
              <div className="ms-auto shrink-0">
                <LanguageSwitcher />
              </div>
            </div>

            <DocuMindLogo className="mb-sm" />
            <p className="max-w-xl text-body-sm text-on-surface-variant sm:text-body-md">
              {description}
            </p>
          </header>

          <div className="shrink-0">{children}</div>

          <footer className="mt-[clamp(1.25rem,3dvh,2rem)] shrink-0 border-t border-outline-variant pt-[clamp(0.75rem,2dvh,1.5rem)]">
            <div className="flex items-center gap-sm">
              <span
                className="material-symbols-outlined text-xl text-on-tertiary-container"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                verified_user
              </span>
              <span className="text-label-sm text-on-surface-variant">
                {securityLabel}
              </span>
            </div>
            <p className="mt-sm text-body-sm text-outline">{rightsLabel}</p>
          </footer>
        </div>
      </section>

      <AuthHeroPanel />
    </main>
  );
}
