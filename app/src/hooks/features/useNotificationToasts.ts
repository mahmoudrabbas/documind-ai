"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/providers/i18n-provider";
import { useToasts, type ToastVariant } from "@/providers/toast-provider";
import {
  resolveNotificationActionHref,
  toNotificationText,
} from "@/lib/notification-utils";
import { markRead } from "@/services/notifications.service";
import type {
  NotificationPriority,
  NotificationSocketEvent,
} from "@/types/api/notifications.types";
import { useNotificationSocket } from "./useNotificationSocket";

const PRIORITY_VARIANT: Record<NotificationPriority, ToastVariant> = {
  critical: "error",
  high: "warning",
  normal: "info",
  low: "info",
};

/**
 * useNotificationToasts — shows a corner toast whenever the socket server
 * pushes a new notification (`notification:created`). The toast carries the
 * notification title/body, a priority-colored accent, and the first action
 * (if any) which navigates to the target route and marks the notification
 * read. Mount once inside the authenticated layout via <NotificationToasts />.
 */
export function useNotificationToasts() {
  const { toast, dismiss } = useToasts();
  const { locale } = useI18n();
  const router = useRouter();

  const handleCreated = useCallback(
    (notification?: NotificationSocketEvent) => {
      if (!notification || !notification.id || !notification.title) return;

      const action = notification.actions?.[0];
      const id = toast({
        variant: PRIORITY_VARIANT[notification.priority ?? "normal"],
        title: toNotificationText(notification.title, locale),
        description: notification.body
          ? toNotificationText(notification.body, locale)
          : undefined,
        actionLabel: action
          ? toNotificationText(action.label, locale)
          : undefined,
        onAction: () => {
          dismiss(id);
          if (action?.url) {
            router.push(resolveNotificationActionHref(action.url));
          }
          if (notification.isRead === false) {
            void markRead(notification.id).catch(() => undefined);
          }
        },
      });
    },
    [toast, dismiss, locale, router],
  );

  useNotificationSocket({ onNotificationCreated: handleCreated });
}
