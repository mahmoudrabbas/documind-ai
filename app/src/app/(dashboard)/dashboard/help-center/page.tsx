"use client";

import { useMemo } from "react";
import { useAuth } from "@/providers/auth-provider";
import { usePermissions } from "@/providers/permission-provider";
import { useI18n } from "@/providers/i18n-provider";
import { Permission } from "@/types/api/permissions.types";
import type { PermissionValue } from "@/types/api/permissions.types";
import {
  DashboardPage,
  DashboardPanel,
} from "@/components/ui/DashboardPage";

type HelpSection = {
  titleKey: string;
  summaryKey: string;
  icon: string;
  permission?: PermissionValue;
  permissionAnyOf?: readonly PermissionValue[];
  points: string[];
};

type PermissionChecker = { can: (permission: PermissionValue) => boolean };

const ALWAYS_VISIBLE_SECTIONS: readonly HelpSection[] = [
  {
    titleKey: "help.section.gettingStarted.title",
    summaryKey: "help.section.gettingStarted.summary",
    icon: "rocket_launch",
    points: [
      "help.section.gettingStarted.point1",
      "help.section.gettingStarted.point2",
      "help.section.gettingStarted.point3",
    ],
  },
  {
    titleKey: "help.section.documents.title",
    summaryKey: "help.section.documents.summary",
    icon: "description",
    permission: Permission.DOCUMENTS_READ,
    points: [
      "help.section.documents.point1",
      "help.section.documents.point2",
      "help.section.documents.point3",
      "help.section.documents.point4",
    ],
  },
  {
    titleKey: "help.section.chat.title",
    summaryKey: "help.section.chat.summary",
    icon: "forum",
    permission: Permission.CHAT_READ,
    points: [
      "help.section.chat.point1",
      "help.section.chat.point2",
      "help.section.chat.point3",
      "help.section.chat.point4",
    ],
  },
  {
    titleKey: "help.section.usersRoles.title",
    summaryKey: "help.section.usersRoles.summary",
    icon: "group",
    permissionAnyOf: [Permission.USERS_READ, Permission.ROLES_READ],
    points: [
      "help.section.usersRoles.point1",
      "help.section.usersRoles.point2",
      "help.section.usersRoles.point3",
      "help.section.usersRoles.point4",
    ],
  },
  {
    titleKey: "help.section.knowledgeGaps.title",
    summaryKey: "help.section.knowledgeGaps.summary",
    icon: "search_insights",
    permission: Permission.KNOWLEDGE_GAPS_READ,
    points: [
      "help.section.knowledgeGaps.point1",
      "help.section.knowledgeGaps.point2",
      "help.section.knowledgeGaps.point3",
    ],
  },
  {
    titleKey: "help.section.usageBilling.title",
    summaryKey: "help.section.usageBilling.summary",
    icon: "payments",
    permission: Permission.BILLING_READ,
    points: [
      "help.section.usageBilling.point1",
      "help.section.usageBilling.point2",
      "help.section.usageBilling.point3",
    ],
  },
  {
    titleKey: "help.section.troubleshooting.title",
    summaryKey: "help.section.troubleshooting.summary",
    icon: "build",
    points: [
      "help.section.troubleshooting.point1",
      "help.section.troubleshooting.point2",
      "help.section.troubleshooting.point3",
      "help.section.troubleshooting.point4",
      "help.section.troubleshooting.point5",
    ],
  },
  {
    titleKey: "help.section.security.title",
    summaryKey: "help.section.security.summary",
    icon: "shield_lock",
    points: [
      "help.section.security.point1",
      "help.section.security.point2",
      "help.section.security.point3",
      "help.section.security.point4",
    ],
  },
];

function sectionIsVisible(section: HelpSection, permissions: PermissionChecker) {
  if (section.permission && !permissions.can(section.permission)) {
    return false;
  }
  if (
    section.permissionAnyOf &&
    !section.permissionAnyOf.some((permission) => permissions.can(permission))
  ) {
    return false;
  }
  return true;
}

export default function HelpCenterPage() {
  const auth = useAuth();
  const permissions = usePermissions();
  const { t } = useI18n();

  const visibleSections = useMemo(
    () => ALWAYS_VISIBLE_SECTIONS.filter((section) =>
      sectionIsVisible(section, permissions),
    ),
    [permissions],
  );

  if (auth.status !== "authenticated") {
    return null;
  }

  const isEmployee = auth.user.role === "EMPLOYEE";
  const introBadge = isEmployee ? t("help.employeeBadge") : t("help.adminBadge");

  return (
    <DashboardPage>
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 sm:gap-5 lg:gap-6">
        <header className="space-y-2 sm:space-y-3">
          <span
            className={[
              "inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-label-xs font-semibold tracking-wide",
              isEmployee
                ? "border-secondary-container/40 bg-secondary-container/15 text-on-surface-variant"
                : "border-primary-container/40 bg-primary-container/15 text-on-surface-variant",
            ].join(" ")}
          >
            {introBadge}
          </span>
          <div className="space-y-1.5">
            <h1 className="text-headline-lg-mobile font-bold tracking-tight text-primary sm:text-headline-lg">
              {t("help.title")}
            </h1>
            <p className="max-w-2xl text-body-md leading-relaxed text-on-surface-variant">
              {t("help.description")}
            </p>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-2 xl:gap-5">
          {visibleSections.map((section) => (
            <DashboardPanel
              key={section.titleKey}
              className="shadow-card transition-shadow duration-200 hover:shadow-md"
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
