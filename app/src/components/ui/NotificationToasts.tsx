"use client";

import { useNotificationToasts } from "@/hooks/features/useNotificationToasts";

/**
 * NotificationToasts — mounts the real-time notification → toast bridge.
 * Renders nothing itself (the visual stack lives in <Toaster />); place it
 * once inside an authenticated layout so socket toasts only fire while a
 * user is signed in.
 */
export function NotificationToasts() {
  useNotificationToasts();
  return null;
}
