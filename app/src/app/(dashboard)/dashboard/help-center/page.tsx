"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { HelpCenterContent, type HelpCenterConfig } from "@/components/help-center/HelpCenterContent";
import { Permission } from "@/types/api/permissions.types";

const HELP_CENTER_CONFIG: HelpCenterConfig = {
  badgeKey: "help.adminBadge",
  titleKey: "help.title",
  descriptionKey: "help.description",
  badgeTone: "secondary",
  sections: [
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
      points: [
        "help.section.documents.point1",
        "help.section.documents.point2",
        "help.section.documents.point3",
        "help.section.documents.point4",
      ],
      permission: Permission.DOCUMENTS_READ,
    },
    {
      titleKey: "help.section.chat.title",
      summaryKey: "help.section.chat.summary",
      icon: "forum",
      points: [
        "help.section.chat.point1",
        "help.section.chat.point2",
        "help.section.chat.point3",
        "help.section.chat.point4",
      ],
      permission: Permission.CHAT_READ,
    },
    {
      titleKey: "help.section.usersRoles.title",
      summaryKey: "help.section.usersRoles.summary",
      icon: "group",
      points: [
        "help.section.usersRoles.point1",
        "help.section.usersRoles.point2",
        "help.section.usersRoles.point3",
        "help.section.usersRoles.point4",
      ],
      permissionAnyOf: [Permission.USERS_READ, Permission.ROLES_READ],
    },
    {
      titleKey: "help.section.knowledgeGaps.title",
      summaryKey: "help.section.knowledgeGaps.summary",
      icon: "search_insights",
      points: [
        "help.section.knowledgeGaps.point1",
        "help.section.knowledgeGaps.point2",
        "help.section.knowledgeGaps.point3",
      ],
      permission: Permission.KNOWLEDGE_GAPS_READ,
    },
    {
      titleKey: "help.section.usageBilling.title",
      summaryKey: "help.section.usageBilling.summary",
      icon: "payments",
      points: [
        "help.section.usageBilling.point1",
        "help.section.usageBilling.point2",
        "help.section.usageBilling.point3",
      ],
      permission: Permission.BILLING_READ,
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
  ],
};

export default function HelpCenterPage() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === "authenticated" && auth.user.role === "SUPER_ADMIN") {
      router.replace("/super-admin/help-center");
    }
  }, [auth.status, auth.user?.role, router]);

  if (auth.status !== "authenticated" || auth.user.role === "SUPER_ADMIN") {
    return null;
  }

  return <HelpCenterContent config={HELP_CENTER_CONFIG} />;
}
