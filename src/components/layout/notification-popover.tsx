"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Info,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ClipboardCheck,
  MessageSquare,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
} from "@/hooks/queries/use-notifications";

const TYPE_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; bg: string }
> = {
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-500/10" },
  warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10" },
  success: { icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  error: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
};

function getResourceUrl(resourceType?: string): string | null {
  return null;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `hace ${diffDays}d`;
  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

export function NotificationPopover() {
  const router = useRouter();
  const { data: notifResult } = useNotifications();
  const { data: unreadCount } = useUnreadNotificationCount();
  const markReadMutation = useMarkNotificationRead();
  const [open, setOpen] = React.useState(false);

  // Use first page of the infinite query, take the 5 most recent
  const recent = React.useMemo(() => {
    const firstPageData = notifResult?.pages?.[0]?.data?.data ?? [];
    return firstPageData.slice(0, 5);
  }, [notifResult]);
  const count = unreadCount ?? 0;

  const handleNotifClick = (notif: any) => {
    if (!notif.is_read) {
      markReadMutation.mutate(notif.id);
    }
    const url = getResourceUrl(notif.resource_type);
    if (url) {
      setOpen(false);
      router.push(url);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          <span className="sr-only">Notificaciones</span>
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4.5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white animate-in zoom-in-50 duration-200">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h4 className="text-sm font-semibold">Notificaciones</h4>
          {count > 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
              {count} sin leer
            </span>
          )}
        </div>

        <div className="max-h-[320px] overflow-y-auto">
          {recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="size-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">
                Sin notificaciones nuevas
              </p>
            </div>
          ) : (
            recent.map((notif: any) => {
              const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.info;
              const Icon = config.icon;

              return (
                <button
                  key={notif.id}
                  type="button"
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50 ${
                    !notif.is_read ? "bg-secondary/20" : ""
                  }`}
                  onClick={() => handleNotifClick(notif)}
                >
                  <div
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${config.bg}`}
                  >
                    <Icon className={`size-3.5 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-xs leading-tight truncate ${
                          !notif.is_read
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {notif.title}
                      </p>
                      {!notif.is_read && (
                        <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {notif.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {timeAgo(notif.created_at)}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
            asChild
            onClick={() => setOpen(false)}
          >
            <Link href="/config/notificaciones">
              Ver todas las notificaciones
              <ArrowRight className="ml-1 size-3" />
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
