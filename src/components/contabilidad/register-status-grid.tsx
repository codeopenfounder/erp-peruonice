"use client";

import { RegisterStatusCard } from "./register-status-card";
import type { CashRegisterStatusItem } from "@/types/gastos";

interface RegisterStatusGridProps {
  registers: CashRegisterStatusItem[];
}

export function RegisterStatusGrid({ registers }: RegisterStatusGridProps) {
  if (registers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">No hay cajas registradas</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {registers.map((register) => (
        <RegisterStatusCard
          key={register.id}
          register={register}
        />
      ))}
    </div>
  );
}
