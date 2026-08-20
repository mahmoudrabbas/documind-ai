"use client";

import { useMemo } from "react";
import { useI18n } from "@/providers/i18n-provider";
import { usePermissions } from "@/providers/permission-provider";
import { DashboardPage, DashboardPanel } from "@/components/ui/DashboardPage";
import type { PermissionValue } from "@/types/api/permissions.types";

type HelpCenterSection = {
  titleKey: string;
  summaryKey: string;
  icon: string;
  points: string[];
  permission?: PermissionValue;
  permissionAnyOf?: readonly PermissionValue[];
};

type HelpCenterConfig = {
  badgeKey: string;
  titleKey: string;
  descriptionKey: string;
  badgeTone?: "primary" | "secondary" | "neutral";
  sections: readonly HelpCenterSection[];
};

type PermissionChecker = { can: (permission: PermissionValue) => boolean };

function isVisible(section: HelpCenterSection, permissions: PermissionChecker) {
  if (section.permission && !permissions.can(section.permission)) return false;
  if (
    section.permissionAnyOf &&
    !section.permissionAnyOf.some((permission) => permissions.can(permission))
  ) {
    return false;
  }
  return true;
}

export function HelpCenterContent({ config }: { config: HelpCenterConfig }) {
  const { t } = useI18n();
  const permissions = usePermissions();

  const visibleSections = useMemo(
    () => config.sections.filter((section) => isVisible(section, permissions)),
    [config.sections, permissions],
  );

  return (
    <DashboardPage>
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-4 sm:gap-5 lg:gap-6">
        <header className="space-y-2">
          <span
            className={[
              "inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-label-xs font-semibold tracking-wide",
              config.badgeTone === "primary"
                ? "border-primary-container/40 bg-primary-container/15 text-on-surface-variant"
                : config.badgeTone === "secondary"
                  ? "border-secondary-container/40 bg-secondary-container/15 text-on-surface-variant"
                  : "border-outline-variant/50 bg-surface-container-low text-on-surface-variant",
            ].join(" ")}
          >
            {t(config.badgeKey)}
          </span>
          <div className="space-y-1.5">
            <h1 className="text-headline-lg-mobile font-bold tracking-tight text-primary sm:text-headline-lg">
              {t(config.titleKey)}
            </h1>
            <p className="max-w-2xl text-body-md leading-relaxed text-on-surface-variant">
              {t(config.descriptionKey)}
            </p>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-2 xl:gap-5">
          {visibleSections.map((section) => (
            <DashboardPanel
              key={section.titleKey}
              className="transition-shadow duration-200 hover:shadow-md"
            >
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-outline-variant/40 bg-surface-container-low text-primary">
                  <span
                    className="material-symbols-outlined text-[20px]"
                    aria-hidden="true"
                  >
                    {section.icon}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-title-md font-semibold text-on-surface">
                    {t(section.titleKey)}
                  </h2>
                  <p className="mt-1.5 text-body-sm leading-relaxed text-on-surface-variant">
                    {t(section.summaryKey)}
                  </p>
                </div>
              </div>

              <ul className="mt-4 space-y-2.5 sm:mt-5">
                {section.points.map((pointKey) => (
                  <li
                    key={pointKey}
                    className="flex items-start gap-3 text-body-sm leading-6 text-on-surface"
                  >
                    <span
                      className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary/80"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">{t(pointKey)}</span>
                  </li>
                ))}
              </ul>
            </DashboardPanel>
          ))}
        </div>
      </div>
    </DashboardPage>
  );
}

export type { HelpCenterConfig, HelpCenterSection };
