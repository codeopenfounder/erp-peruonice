"use client";

import * as React from "react";
import {
  Bell,
  CheckCheck,
  Info,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ClipboardCheck,
  MessageSquare,
  Loader2,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/queries/use-notifications";

const TYPE_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; bg: string; label: string }
> = {
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-500/10", label: "Información" },
  warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", label: "Advertencia" },
  success: { icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Éxito" },
  error: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", label: "Error" },
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Justo ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Hace ${diffDays} dias`;
  return date.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: diffDays > 365 ? "numeric" : undefined,
  });
}

export default function NotificacionesPage() {
  const [filter, setFilter] = React.useState<string>("all");
  const { data: notifResult, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useNotifications(filter);
  const { data: unreadCount } = useUnreadNotificationCount();
  const markReadMutation = useMarkNotificationRead();
  const markAllMutation = useMarkAllNotificationsRead();

  const notifications = React.useMemo(() => {
    return notifResult?.pages?.flatMap((page) => page.data?.data ?? []) ?? [];
  }, [notifResult]);

  const handleMarkRead = (id: string) => {
    markReadMutation.mutate(id);
  };

  const handleMarkAllRead = async () => {
    const result = await markAllMutation.mutateAsync();
    if (result.success) {
      toast.success("Todas las notificaciones marcadas como leidas");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificaciones"
        description="Revise las alertas y actualizaciones del sistema"
        actions={
          (unreadCount ?? 0) > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markAllMutation.isPending}
            >
              {markAllMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <CheckCheck className="mr-2 size-4" />
              )}
              Marcar todo como leido
            </Button>
          ) : undefined
        }
      />

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter className="size-4 text-muted-foreground" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="unread">Sin leer</SelectItem>
            <SelectItem value="activity">Actividad</SelectItem>
          </SelectContent>
        </Select>
        {(unreadCount ?? 0) > 0 && (
          <Badge variant="secondary" className="bg-primary/15 text-primary">
            {unreadCount} sin leer
          </Badge>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {/* Notification list */}
      {!isLoading && notifications.length === 0 && (
        <EmptyState
          icon={Bell}
          title="Sin notificaciones"
          description={
            filter === "unread"
              ? "No tiene notificaciones sin leer"
              : "No se encontraron notificaciones con el filtro seleccionado"
          }
        />
      )}

      {!isLoading && notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((notif: any, i: number) => {
            const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.info;
            const Icon = config.icon;

            return (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
              >
                <Card
                  className={`transition-colors ${
                    !notif.is_read
                      ? "border-primary/20 bg-primary/[0.02]"
                      : "border-border/50"
                  }`}
                >
                  <CardContent className="flex items-start gap-4 p-4">
                    <div
                      className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${config.bg}`}
                    >
                      <Icon className={`size-4 ${config.color}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className={`text-sm leading-tight ${
                            !notif.is_read
                              ? "font-medium text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {notif.title}
                        </p>
                        {!notif.is_read && (
                          <span className="size-2 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {notif.message}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${config.bg} ${config.color} border-transparent`}
                        >
                          {config.label}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground/60">
                          {formatDate(notif.created_at)}
                        </span>
                      </div>
                    </div>

                    {!notif.is_read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => handleMarkRead(notif.id)}
                        disabled={markReadMutation.isPending}
                      >
                        Marcar leido
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}

          {/* Load more */}
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                Cargar mas
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
