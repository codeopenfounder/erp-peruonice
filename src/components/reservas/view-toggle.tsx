"use client";

import { CalendarDays, CalendarRange, Clock, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ViewMode = "month" | "week" | "day" | "list";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}

const VIEW_OPTIONS: { mode: ViewMode; label: string; icon: React.ElementType }[] = [
  { mode: "month", label: "Mes", icon: CalendarDays },
  { mode: "week", label: "Semana", icon: CalendarRange },
  { mode: "day", label: "Dia", icon: Clock },
  { mode: "list", label: "Lista", icon: List },
];

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border bg-muted p-0.5">
      {VIEW_OPTIONS.map(({ mode, label, icon: Icon }) => {
        const isActive = value === mode;
        return (
          <Button
            key={mode}
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              "gap-1.5 rounded-md px-2.5 transition-colors",
              isActive
                ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                : "text-muted-foreground hover:bg-background hover:text-foreground"
            )}
            onClick={() => onChange(mode)}
          >
            <Icon className="size-4" />
            <span className="hidden md:inline">{label}</span>
          </Button>
        );
      })}
    </div>
  );
}
