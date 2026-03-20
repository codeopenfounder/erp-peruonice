"use client";

import { Banknote, Clock, DollarSign, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CashRegisterStatusItem } from "@/types/gastos";

interface RegisterStatusCardProps {
  register: CashRegisterStatusItem;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "--:--";
  try {
    return new Date(dateStr).toLocaleString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "--:--";
  }
}

export function RegisterStatusCard({ register }: RegisterStatusCardProps) {
  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{register.name}</h3>
            <p className="font-mono text-xs text-muted-foreground">{register.code}</p>
          </div>
          <StatusBadge
            status={register.is_open ? "active" : "closed"}
            customLabel={register.is_open ? "Abierta" : "Cerrada"}
          />
        </div>

        {/* Branch */}
        {register.branch_name && (
          <p className="text-xs text-muted-foreground">{register.branch_name}</p>
        )}

        {/* Open details */}
        {register.is_open && (
          <div className="space-y-1.5 rounded-md bg-secondary/30 p-2.5">
            <div className="flex items-center gap-2 text-xs text-foreground">
              <User className="size-3.5 text-muted-foreground" />
              <span>{register.opened_by_name || "Desconocido"}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-foreground">
              <Clock className="size-3.5 text-muted-foreground" />
              <span>{formatTime(register.opened_at)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-foreground">
              <DollarSign className="size-3.5 text-muted-foreground" />
              <span>Apertura: S/ {register.opening_amount.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Accumulated cash */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Banknote className="size-3.5" />
          <span>
            Dinero en caja:{" "}
            <span className="font-semibold text-foreground">
              S/ {register.accumulated_cash.toFixed(2)}
            </span>
          </span>
        </div>

      </CardContent>
    </Card>
  );
}
