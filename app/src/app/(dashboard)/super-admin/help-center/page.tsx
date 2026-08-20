"use client";

import { useAuth } from "@/providers/auth-provider";
import { HelpCenterContent, type HelpCenterConfig } from "@/components/help-center/HelpCenterContent";

const HELP_CENTER_CONFIG: HelpCenterConfig = {
  badgeKey: "superAdmin.help.badge",
  titleKey: "superAdmin.help.title",
  descriptionKey: "superAdmin.help.description",
  badgeTone: "primary",
  sections: [
    {
      titleKey: "superAdmin.help.gettingStarted.title",
      summaryKey: "superAdmin.help.gettingStarted.summary",
      icon: "rocket_launch",
      points: [
        "superAdmin.help.gettingStarted.point1",
        "superAdmin.help.gettingStarted.point2",
        "superAdmin.help.gettingStarted.point3",
      ],
    },
    {
      titleKey: "superAdmin.help.customers.title",
      summaryKey: "superAdmin.help.customers.summary",
      icon: "business",
      points: [
        "superAdmin.help.customers.point1",
        "superAdmin.help.customers.point2",
        "superAdmin.help.customers.point3",
      ],
    },
    {
      titleKey: "superAdmin.help.billing.title",
      summaryKey: "superAdmin.help.billing.summary",
      icon: "payments",
      points: [
        "superAdmin.help.billing.point1",
        "superAdmin.help.billing.point2",
        "superAdmin.help.billing.point3",
      ],
    },
    {
      titleKey: "superAdmin.help.systemHealth.title",
      summaryKey: "superAdmin.help.systemHealth.summary",
      icon: "health_and_safety",
      points: [
        "superAdmin.help.systemHealth.point1",
        "superAdmin.help.systemHealth.point2",
        "superAdmin.help.systemHealth.point3",
      ],
    },
    {
      titleKey: "superAdmin.help.aiConfiguration.title",
      summaryKey: "superAdmin.help.aiConfiguration.summary",
      icon: "psychology",
      points: [
        "superAdmin.help.aiConfiguration.point1",
        "superAdmin.help.aiConfiguration.point2",
        "superAdmin.help.aiConfiguration.point3",
      ],
    },
    {
      titleKey: "superAdmin.help.analytics.title",
      summaryKey: "superAdmin.help.analytics.summary",
      icon: "analytics",
      points: [
        "superAdmin.help.analytics.point1",
        "superAdmin.help.analytics.point2",
        "superAdmin.help.analytics.point3",
      ],
    },
    {
      titleKey: "superAdmin.help.security.title",
      summaryKey: "superAdmin.help.security.summary",
      icon: "shield_lock",
      points: [
        "superAdmin.help.security.point1",
        "superAdmin.help.security.point2",
        "superAdmin.help.security.point3",
      ],
    },
    {
      titleKey: "superAdmin.help.settings.title",
      summaryKey: "superAdmin.help.settings.summary",
      icon: "settings",
      points: [
        "superAdmin.help.settings.point1",
        "superAdmin.help.settings.point2",
        "superAdmin.help.settings.point3",
      ],
    },
    {
      titleKey: "superAdmin.help.troubleshooting.title",
      summaryKey: "superAdmin.help.troubleshooting.summary",
      icon: "build",
      points: [
        "superAdmin.help.troubleshooting.point1",
        "superAdmin.help.troubleshooting.point2",
        "superAdmin.help.troubleshooting.point3",
      ],
    },
  ],
};

export default function SuperAdminHelpCenterPage() {
  const auth = useAuth();

  if (auth.status !== "authenticated") {
    return null;
  }

  return <HelpCenterContent config={HELP_CENTER_CONFIG} />;
}
