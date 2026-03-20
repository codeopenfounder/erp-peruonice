"use client";

import { useState } from "react";
import { Settings2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { AdjustFundDialog } from "@/components/gastos/adjust-fund-dialog";
import { useExpenseFundStatus } from "@/hooks/queries/use-expense-fund";

function formatCurrency(amount: number): string {
  return `S/ ${amount.toFixed(2)}`;
}

function getBalanceStyle(balance: number, capital: number): string {
  if (capital <= 0) return "text-foreground font-medium";
  const ratio = balance / capital;
  if (ratio < 0.2) return "text-destructive font-medium";
  return "text-foreground font-medium";
}

export default function FondosDeGastosPage() {
  const { data, isLoading } = useExpenseFundStatus();
  const registers = data?.registers;

  // Adjust dialog state
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selectedRegister, setSelectedRegister] = useState<{
    id: string;
    name: string;
    capital: number;
  } | null>(null);

  const handleAdjust = (reg: { id: string; name: string; capital: number }) => {
    setSelectedRegister(reg);
    setAdjustOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fondos de Gastos"
        description="Gestión del fondo de caja fuerte"
      />

      {/* Info badge */}
      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Renovación automática el 1ro de cada mes
        </p>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : !registers || registers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-sm text-muted-foreground">
            No hay cajas registradas
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>Caja</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Sede</TableHead>
                <TableHead className="text-right">Capital Mensual</TableHead>
                <TableHead className="text-right">Saldo Actual</TableHead>
                <TableHead className="w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registers.map((register) => (
                <TableRow
                  key={register.id}
                  className="border-border hover:bg-secondary/30 transition-colors"
                >
                  <TableCell className="text-sm font-medium text-foreground">
                    {register.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {register.code}
                  </TableCell>
                  <TableCell className="text-sm text-foreground">
                    {register.branch_name || (
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {formatCurrency(register.capital)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono text-sm tabular-nums ${getBalanceStyle(register.balance, register.capital)}`}
                  >
                    {formatCurrency(register.balance)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() =>
                        handleAdjust({
                          id: register.id,
                          name: register.name,
                          capital: register.capital,
                        })
                      }
                    >
                      <Settings2 className="mr-1 size-3.5" />
                      Ajustar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Adjust Fund Dialog */}
      <AdjustFundDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        register={selectedRegister}
      />
    </div>
  );
}
