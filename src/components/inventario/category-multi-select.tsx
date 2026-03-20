"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryOption {
  id: string;
  name: string;
  level: number;
}

interface CategoryMultiSelectProps {
  categories: CategoryOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function CategoryMultiSelect({ categories, selected, onChange }: CategoryMultiSelectProps) {
  const selectedSet = new Set(selected);

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  const remove = (id: string) => {
    onChange(selected.filter((s) => s !== id));
  };

  const selectedNames = categories.filter((c) => selectedSet.has(c.id));

  return (
    <div className="space-y-2">
      {selectedNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedNames.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              {c.name}
              <button type="button" onClick={() => remove(c.id)} className="hover:text-primary/70">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-card p-2 space-y-0.5">
        {categories.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 text-center">No hay categorias</p>
        ) : (
          categories.map((c) => {
            const isChecked = selectedSet.has(c.id);
            return (
              <div
                key={c.id}
                role="checkbox"
                aria-checked={isChecked}
                tabIndex={0}
                onClick={() => toggle(c.id)}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(c.id); } }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors hover:bg-secondary/50",
                  isChecked && "bg-primary/5"
                )}
                style={{ paddingLeft: `${c.level * 16 + 8}px` }}
              >
                <div
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs transition-colors",
                    isChecked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-transparent"
                  )}
                >
                  {isChecked && <Check className="size-3" />}
                </div>
                <span className="truncate">{c.name}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
