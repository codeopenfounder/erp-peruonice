"use client";

import { Trash2, Search, User, Zap, BarChart3, ArrowDown, ArrowUp, ArrowLeftRight, ShoppingCart, RotateCcw, Gift } from "lucide-react";

const MOVEMENT_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  waste: { label: "Merma", icon: Trash2, className: "bg-red-500/15 text-red-500 border-red-500/30" },
  shrinkage: { label: "Perdida/Robo", icon: Search, className: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  staff_consumption: { label: "Consumo Personal", icon: User, className: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  breakage: { label: "Rotura", icon: Zap, className: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  adjustment: { label: "Ajuste", icon: BarChart3, className: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
  transfer: { label: "Transferencia", icon: ArrowLeftRight, className: "bg-purple-500/15 text-purple-500 border-purple-500/30" },
  income: { label: "Ingreso", icon: ArrowDown, className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  outcome: { label: "Egreso", icon: ArrowUp, className: "bg-red-500/15 text-red-500 border-red-500/30" },
  sale: { label: "Venta", icon: ShoppingCart, className: "bg-cyan-500/15 text-cyan-500 border-cyan-500/30" },
  nc_return: { label: "Devolucion NC", icon: RotateCcw, className: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  cortesia: { label: "Cortesia", icon: Gift, className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
};

interface MovementTypeBadgeProps {
  type: string;
}

export function MovementTypeBadge({ type }: MovementTypeBadgeProps) {
  const config = MOVEMENT_TYPE_CONFIG[type] || {
    label: type,
    icon: BarChart3,
    className: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  };
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${config.className}`}
    >
      <Icon className="size-3" />
      {config.label}
    </span>
  );
}
