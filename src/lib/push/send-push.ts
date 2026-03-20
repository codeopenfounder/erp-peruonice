import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails("mailto:admin@codeopen.tech", VAPID_PUBLIC, VAPID_PRIVATE);
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Send Web Push notification to a specific user (all their subscribed devices).
 * Silently cleans up expired/invalid subscriptions.
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const supabase = createAdminClient();
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return;

  const jsonPayload = JSON.stringify(payload);
  const expiredIds: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          jsonPayload,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404 or 410 = subscription expired/invalid
        if (status === 404 || status === 410) {
          expiredIds.push(sub.id);
        }
      }
    }),
  );

  // Clean up expired subscriptions
  if (expiredIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", expiredIds);
  }
}

/**
 * Send Web Push notification to all users with given roles in a tenant.
 */
export async function sendPushToRoles(
  tenantId: string,
  roles: string[],
  payload: PushPayload,
) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const supabase = createAdminClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("role", roles);

  if (!users || users.length === 0) return;

  await Promise.allSettled(
    users.map((u) => sendPushToUser(u.id, payload)),
  );
}
