"use client";

import { useEffect, useRef } from "react";
import { useUnreadNotificationCount, useNotifications } from "@/hooks/queries/use-notifications";
import { useThemeStore } from "@/stores/theme-store";

/**
 * Hook that triggers browser Notification API when new in-app
 * notifications arrive (detected via polling count changes).
 *
 * Requires:
 * - push_enabled = true in user preferences
 * - Notification.permission === "granted"
 */
export function useNotificationPush() {
  const pushEnabled = useThemeStore((s) => s.pushEnabled);
  const { data: unreadCount } = useUnreadNotificationCount();
  const { data: notifResult } = useNotifications();
  const prevCountRef = useRef<number | null>(null);

  useEffect(() => {
    // Skip if push not enabled or not supported
    if (!pushEnabled) return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const currentCount = unreadCount ?? 0;

    // First render — just store the initial count
    if (prevCountRef.current === null) {
      prevCountRef.current = currentCount;
      return;
    }

    // Check if new notifications arrived
    if (currentCount > prevCountRef.current) {
      const newCount = currentCount - prevCountRef.current;
      const notifications = notifResult?.pages?.flatMap((p) => p.data?.data ?? []) ?? [];
      const latestNew = notifications.filter((n: any) => !n.is_read).slice(0, newCount);

      for (const notif of latestNew) {
        try {
          new Notification(notif.title || "POI", {
            body: notif.message || "",
            icon: "/favicon.ico",
            tag: notif.id,
          });
        } catch {
          // Fallback silently if Notification constructor fails
        }
      }
    }

    prevCountRef.current = currentCount;
  }, [unreadCount, pushEnabled, notifResult]);
}
