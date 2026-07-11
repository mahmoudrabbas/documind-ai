"use client";

import { useI18n } from "@/providers/i18n-provider";

interface AuthHeroPanelProps {
  title: string;
  description: string;
}

export function AuthHeroPanel({ title, description }: AuthHeroPanelProps) {
  const { t } = useI18n();

  const trustItems = [
    {
      title: t("auth.tenantIsolationTitle"),
      description: t("auth.tenantIsolationDesc"),
    },
    {
      title: t("auth.verifiedAccessTitle"),
      description: t("auth.verifiedAccessDesc"),
    },
    {
      title: t("auth.privateAnswersTitle"),
      description: t("auth.privateAnswersDesc"),
    },
  ];

  return (
    <section className="bg-[#001524] text-white w-full lg:w-1/2 flex flex-col justify-center items-center px-6 py-12 lg:px-16 min-h-[40vh] lg:min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08)_0%,transparent_70%)] pointer-events-none" />

      <div className="max-w-md w-full min-w-[280px] sm:min-w-[400px] flex flex-col items-center relative z-10">
        <div className="flex flex-col items-center gap-2">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-500/20"
            aria-hidden="true"
          >
            DM
          </span>
          <p className="text-xl font-bold tracking-tight text-white mt-2">
            {t("landing.appName")}
          </p>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
            {t("landing.tagline")}
          </p>
        </div>

        <div className="mt-8 text-center w-full">
          <span className="inline-flex items-center rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400 mb-4">
            {t("landing.badge")}
          </span>

          <h1 className="text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-white text-center w-full block">
            {title}
          </h1>

          <p className="mt-4 text-sm leading-relaxed text-slate-300 text-center w-full max-w-sm block">
            {description}
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-3 w-full">
          {trustItems.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-4 flex gap-3.5 items-start backdrop-blur-sm text-start"
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-sm font-bold text-blue-400"
                aria-hidden="true"
              >
                ✓
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="mt-0.5 text-xs text-slate-400 leading-normal">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
