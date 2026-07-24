"use client";

import { Badge } from "@/components/ui/Badge";
import type { ClassificationLevel } from "@/types/api/document-policy.types";
import { useI18n } from "@/providers/i18n-provider";

const PRESENTATION: Record<ClassificationLevel, { icon: string; status: "info" | "warning" | "error"; label: string }> = {
  internal: { icon: "business", status: "info", label: "classification.internal" },
  restricted: { icon: "lock", status: "warning", label: "classification.restricted" },
  confidential: { icon: "shield_lock", status: "error", label: "classification.confidential" },
  highly_confidential: { icon: "encrypted", status: "error", label: "classification.highly_confidential" },
};

export function ClassificationBadge({ level, label }: { level?: string | null; label?: string }) {
  const { t } = useI18n();
  const item = level && level in PRESENTATION ? PRESENTATION[level as ClassificationLevel] : null;
  return (
    <Badge status={item?.status ?? "neutral"}>
      <span className="material-symbols-outlined me-1 align-middle text-[15px]" aria-hidden="true">{item?.icon ?? "help"}</span>
      <span>{label ?? (item ? t(item.label) : t("classification.unknown"))}</span>
      <span className="sr-only"> — {t("classification.accessNotImplied")}</span>
    </Badge>
  );
}
