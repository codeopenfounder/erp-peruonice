"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Printer,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSearch,
  Clock,
  User,
  Building2,
  CreditCard,
  Banknote,
  ArrowDownRight,
  ArrowUpRight,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { motion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import {
  useArqueoDetail,
  useArqueoMovements,
} from "@/hooks/queries/use-arqueos";

const DENOMINATIONS = [
  { value: "200", label: "S/ 200" },
  { value: "100", label: "S/ 100" },
  { value: "50", label: "S/ 50" },
  { value: "20", label: "S/ 20" },
  { value: "10", label: "S/ 10" },
  { value: "5", label: "S/ 5" },
  { value: "2", label: "S/ 2" },
  { value: "1", label: "S/ 1" },
  { value: "0.5", label: "S/ 0.50" },
  { value: "0.2", label: "S/ 0.20" },
  { value: "0.1", label: "S/ 0.10" },
];

function formatCurrency(amount: number): string {
  return `S/ ${amount.toFixed(2)}`;
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "--";
  try {
    return new Date(dateStr).toLocaleString("es-PE", {
      timeZone: "America/Lima",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--";
  }
}

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("es-PE", {
      timeZone: "America/Lima",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--";
  }
}

function getMovementTypeLabel(type: string): string {
  const map: Record<string, string> = {
    sale: "Venta",
    income: "Ingreso",
    expense: "Egreso",
    refund: "Devolución",
    cash_in: "Ingreso",
    cash_out: "Retiro",
    nd_charge: "Nota Débito",
    petty_cash_in: "Caja Chica",
  };
  return map[type] || type;
}

function getMovementTypeColor(type: string): string {
  switch (type) {
    case "sale":
      return "bg-success/10 text-success";
    case "income":
    case "cash_in":
    case "nd_charge":
      return "bg-blue-500/10 text-blue-500";
    case "expense":
    case "cash_out":
      return "bg-destructive/10 text-destructive";
    case "refund":
      return "bg-amber-500/10 text-amber-500";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

export default function ArqueoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: arqueo, isLoading } = useArqueoDetail(id);
  const { data: movements } = useArqueoMovements(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-[200px] rounded-xl" />
            <Skeleton className="h-[300px] rounded-xl" />
          </div>
          <Skeleton className="h-[400px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!arqueo) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <FileSearch className="size-12 mb-3 opacity-40" />
        <p className="text-lg font-medium">Arqueo no encontrado</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/finanzas/arqueos")}
        >
          Volver a Arqueos
        </Button>
      </div>
    );
  }

  const absDiff = Math.abs(arqueo.difference);
  const diffStatus =
    absDiff === 0 ? "exact" : absDiff <= 5 ? "minor" : "significant";
  const statusConfig = {
    exact: {
      bg: "bg-success/10 border-success/20",
      text: "text-success",
      icon: CheckCircle2,
      label: "Caja cuadrada",
    },
    minor: {
      bg: "bg-amber-500/10 border-amber-500/20",
      text: "text-amber-500",
      icon: AlertTriangle,
      label: "Diferencia menor",
    },
    significant: {
      bg: "bg-destructive/10 border-destructive/20",
      text: "text-destructive",
      icon: XCircle,
      label: "Diferencia significativa",
    },
  };
  const config = statusConfig[diffStatus];
  const StatusIcon = config.icon;

  const handlePrint = () => window.print();

  const denomCounts = arqueo.denomination_counts || {};
  const hasDenominations = Object.values(denomCounts).some((v) => v > 0);

  return (
    <>
      {/* Screen layout */}
      <div className="space-y-6 print:hidden">
        <PageHeader
          title={
            arqueo.type === "cierre"
              ? "Arqueo de Cierre"
              : "Arqueo Sorpresa"
          }
          description={`${arqueo.cash_register_name} (${arqueo.cash_register_code}) - ${formatDateTime(arqueo.created_at)}`}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 size-4" />
                Volver
              </Button>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="mr-2 size-4" />
                Imprimir / PDF
              </Button>
            </div>
          }
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Info card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Información General
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div className="flex items-start gap-2">
                      <FileSearch className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Tipo</p>
                        {arqueo.type === "cierre" ? (
                          <Badge variant="secondary" className="mt-0.5 text-[10px]">
                            Cierre
                          </Badge>
                        ) : (
                          <Badge className="mt-0.5 bg-primary/10 text-primary border-primary/20 text-[10px]">
                            Sorpresa
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Building2 className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Sede</p>
                        <p className="text-sm font-medium">
                          {arqueo.branch_name || "--"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Clock className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Periodo</p>
                        <p className="text-xs font-mono">
                          {formatDateTime(arqueo.period_start)}
                        </p>
                        <p className="text-xs font-mono">
                          {formatDateTime(arqueo.period_end)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <User className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Cajero</p>
                        <p className="text-sm font-medium">
                          {arqueo.cashier_name || "--"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <User className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Supervisor
                        </p>
                        <p className="text-sm font-medium">
                          {arqueo.supervisor_name || "--"}
                        </p>
                      </div>
                    </div>
                    {arqueo.notes && (
                      <div className="col-span-2 sm:col-span-3 flex items-start gap-2">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Observaciones
                          </p>
                          <p className="text-sm mt-0.5">{arqueo.notes}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Financial summary */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.3 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Resumen Financiero
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Row
                      icon={Banknote}
                      label="Fondo inicial"
                      value={formatCurrency(arqueo.opening_amount)}
                    />
                    <div className="border-t border-border/50 my-2" />
                    <Row
                      icon={CreditCard}
                      label="Ventas efectivo"
                      value={formatCurrency(arqueo.total_sales_cash)}
                      accent="text-success"
                    />
                    <Row
                      label="Ventas tarjeta"
                      value={formatCurrency(arqueo.total_sales_card)}
                      sub
                    />
                    <Row
                      label="Ventas transferencia"
                      value={formatCurrency(arqueo.total_sales_transfer)}
                      sub
                    />
                    <div className="border-t border-border/50 my-2" />
                    <Row
                      icon={ArrowUpRight}
                      label="Ingresos manuales"
                      value={formatCurrency(arqueo.total_income)}
                      accent="text-blue-500"
                    />
                    <Row
                      icon={ArrowDownRight}
                      label="Egresos / retiros"
                      value={formatCurrency(arqueo.total_expense)}
                      accent="text-destructive"
                    />
                    <Row
                      icon={RotateCcw}
                      label="Devoluciones"
                      value={formatCurrency(arqueo.total_refunds)}
                      accent="text-amber-500"
                    />
                    <Row
                      icon={Wallet}
                      label="Caja chica"
                      value={formatCurrency(arqueo.total_petty_cash)}
                    />
                    <div className="border-t border-border/50 my-2" />
                    <div className="flex justify-between items-baseline text-xs text-muted-foreground">
                      <span>
                        {arqueo.sale_count} comprobantes &middot;{" "}
                        {arqueo.movement_count} movimientos
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Result card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
            >
              <Card className={`border ${config.bg}`}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <StatusIcon className={`size-5 ${config.text}`} />
                    <span className={`text-sm font-semibold ${config.text}`}>
                      {config.label}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-muted-foreground">
                        Efectivo esperado
                      </span>
                      <span className="text-lg font-bold font-mono tabular-nums">
                        {formatCurrency(arqueo.expected_amount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-muted-foreground">
                        Efectivo contado
                      </span>
                      <span className="text-lg font-bold font-mono tabular-nums">
                        {formatCurrency(arqueo.counted_amount)}
                      </span>
                    </div>
                    <div className="border-t border-border/50 my-2" />
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-medium">Diferencia</span>
                      <span
                        className={`text-xl font-bold font-mono tabular-nums ${config.text}`}
                      >
                        {arqueo.difference >= 0 ? "+" : ""}
                        {formatCurrency(arqueo.difference)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Movements */}
            {movements && movements.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.3 }}
              >
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Movimientos ({movements.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/50">
                            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                              Hora
                            </th>
                            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                              Tipo
                            </th>
                            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                              Descripción
                            </th>
                            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                              Responsable
                            </th>
                            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">
                              Monto
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {movements.map((m) => (
                            <tr
                              key={m.id}
                              className="border-b border-border/30 last:border-0"
                            >
                              <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                                {formatTime(m.created_at)}
                              </td>
                              <td className="px-4 py-2">
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${getMovementTypeColor(m.type)}`}
                                >
                                  {getMovementTypeLabel(m.type)}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-xs max-w-[200px] truncate">
                                {m.description || m.reason || "--"}
                              </td>
                              <td className="px-4 py-2 text-xs">
                                {m.created_by_name || "--"}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">
                                {formatCurrency(m.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Denomination breakdown */}
            {hasDenominations && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.3 }}
              >
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Conteo por Denominacion
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {DENOMINATIONS.map((d) => {
                        const qty = denomCounts[d.value] || 0;
                        const subtotal =
                          parseFloat(d.value) * qty;
                        return (
                          <div
                            key={d.value}
                            className={`flex items-center justify-between py-1.5 ${
                              qty === 0
                                ? "text-muted-foreground/50"
                                : "text-foreground"
                            }`}
                          >
                            <span className="text-sm font-mono w-16">
                              {d.label}
                            </span>
                            <span className="text-sm font-mono tabular-nums w-10 text-center">
                              {qty}
                            </span>
                            <span className="text-sm font-mono tabular-nums text-right w-20">
                              {formatCurrency(subtotal)}
                            </span>
                          </div>
                        );
                      })}
                      <div className="border-t border-border pt-2 mt-2 flex items-center justify-between font-bold">
                        <span className="text-sm">Total</span>
                        <span className="text-sm font-mono tabular-nums">
                          {formatCurrency(arqueo.counted_amount)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Print layout */}
      <div className="hidden print:block print:text-black">
        <PrintLayout arqueo={arqueo} movements={movements || []} denomCounts={denomCounts} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Row({
  icon: Icon,
  label,
  value,
  accent,
  sub,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: string;
  sub?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-baseline ${sub ? "pl-6" : ""}`}
    >
      <div className="flex items-center gap-2">
        {Icon && (
          <Icon
            className={`size-3.5 ${accent || "text-muted-foreground"} shrink-0`}
          />
        )}
        <span
          className={`text-sm ${sub ? "text-muted-foreground text-xs" : ""}`}
        >
          {label}
        </span>
      </div>
      <span
        className={`font-mono text-sm tabular-nums ${accent || ""}`}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Print Layout (A4 optimized)
// ---------------------------------------------------------------------------
function PrintLayout({
  arqueo,
  movements,
  denomCounts,
}: {
  arqueo: NonNullable<ReturnType<typeof useArqueoDetail>["data"]>;
  movements: { id: string; type: string; amount: number; description: string | null; reason: string | null; payment_method: string | null; created_by_name: string | null; created_at: string }[];
  denomCounts: Record<string, number>;
}) {
  const hasDenominations = Object.values(denomCounts).some((v) => v > 0);
  const absDiff = Math.abs(arqueo.difference);
  const diffLabel =
    absDiff === 0
      ? "CAJA CUADRADA"
      : absDiff <= 5
        ? "DIFERENCIA MENOR"
        : "DIFERENCIA SIGNIFICATIVA";

  return (
    <div className="max-w-[700px] mx-auto font-sans text-[11px] leading-tight">
      {/* Header */}
      <div className="text-center mb-6 print-no-break">
        <h1 className="text-xl font-bold">Perú On Ice</h1>
        <h2 className="text-base font-semibold mt-1 text-red-600 uppercase tracking-wide">
          {arqueo.type === "cierre" ? "Arqueo de Cierre" : "Arqueo Sorpresa"}
        </h2>
        <p className="mt-1">
          {arqueo.cash_register_name} ({arqueo.cash_register_code})
          {arqueo.branch_name && ` - ${arqueo.branch_name}`}
        </p>
        <p>{formatDateTime(arqueo.created_at)}</p>
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-4 border-b pb-3 print-no-break">
        <div>
          <strong>Cajero:</strong> {arqueo.cashier_name || "--"}
        </div>
        <div>
          <strong>Supervisor:</strong> {arqueo.supervisor_name || "--"}
        </div>
        <div>
          <strong>Apertura:</strong> {formatDateTime(arqueo.period_start)}
        </div>
        <div>
          <strong>Cierre/Arqueo:</strong> {formatDateTime(arqueo.period_end)}
        </div>
      </div>

      {/* Financial summary table */}
      <table className="w-full mb-4 border-collapse print-no-break">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="text-left py-1 font-semibold">Concepto</th>
            <th className="text-right py-1 font-semibold">Monto</th>
          </tr>
        </thead>
        <tbody>
          <PrintRow label="Fondo inicial" value={arqueo.opening_amount} />
          <PrintRow label="Ventas efectivo" value={arqueo.total_sales_cash} />
          <PrintRow
            label="Ventas tarjeta"
            value={arqueo.total_sales_card}
            sub
          />
          <PrintRow
            label="Ventas transferencia"
            value={arqueo.total_sales_transfer}
            sub
          />
          <PrintRow label="Ingresos manuales" value={arqueo.total_income} />
          <PrintRow label="Egresos / retiros" value={arqueo.total_expense} />
          <PrintRow label="Devoluciones" value={arqueo.total_refunds} />
          <PrintRow label="Caja chica" value={arqueo.total_petty_cash} />
          <tr className="border-t border-gray-300">
            <td className="py-1 text-[10px] text-gray-500">
              {arqueo.sale_count} comprobantes &middot; {arqueo.movement_count}{" "}
              movimientos
            </td>
            <td />
          </tr>
        </tbody>
      </table>

      {/* Result box */}
      <div className="border-2 border-black p-3 mb-4 print-no-break">
        <div className="text-center font-bold text-[10px] uppercase tracking-wider mb-2">
          {diffLabel}
        </div>
        <div className="grid grid-cols-3 text-center">
          <div>
            <div className="text-[9px] text-gray-500 uppercase">Esperado</div>
            <div className="font-bold text-sm font-mono">
              {formatCurrency(arqueo.expected_amount)}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-gray-500 uppercase">Contado</div>
            <div className="font-bold text-sm font-mono">
              {formatCurrency(arqueo.counted_amount)}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-gray-500 uppercase">
              Diferencia
            </div>
            <div className="font-bold text-sm font-mono">
              {arqueo.difference >= 0 ? "+" : ""}
              {formatCurrency(arqueo.difference)}
            </div>
          </div>
        </div>
      </div>

      {/* Denominations */}
      {hasDenominations && (
        <div className="mb-4 print-no-break">
          <h3 className="font-semibold border-b border-black pb-1 mb-2">
            Desglose por Denominacion
          </h3>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-300 text-[10px]">
                <th className="text-left py-0.5">Denominacion</th>
                <th className="text-center py-0.5">Cantidad</th>
                <th className="text-right py-0.5">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {DENOMINATIONS.map((d) => {
                const qty = denomCounts[d.value] || 0;
                return (
                  <tr key={d.value} className="border-b border-gray-100">
                    <td className="py-0.5 font-mono">{d.label}</td>
                    <td className="py-0.5 text-center font-mono">{qty}</td>
                    <td className="py-0.5 text-right font-mono">
                      {formatCurrency(parseFloat(d.value) * qty)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-black font-bold">
                <td className="py-1">Total</td>
                <td />
                <td className="py-1 text-right font-mono">
                  {formatCurrency(arqueo.counted_amount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Movements table - flows across pages naturally, thead repeats */}
      {movements.length > 0 && (
        <div className="mb-4">
          <h3 className="font-semibold border-b border-black pb-1 mb-2">
            Movimientos ({movements.length})
          </h3>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left py-0.5">Hora</th>
                <th className="text-left py-0.5">Tipo</th>
                <th className="text-left py-0.5">Descripción</th>
                <th className="text-left py-0.5">Responsable</th>
                <th className="text-right py-0.5">Monto</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-gray-100">
                  <td className="py-0.5 font-mono">
                    {formatTime(m.created_at)}
                  </td>
                  <td className="py-0.5">{getMovementTypeLabel(m.type)}</td>
                  <td className="py-0.5 max-w-[180px] truncate">
                    {m.description || m.reason || "--"}
                  </td>
                  <td className="py-0.5">{m.created_by_name || "--"}</td>
                  <td className="py-0.5 text-right font-mono">
                    {formatCurrency(m.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      {arqueo.notes && (
        <div className="mb-4 border border-gray-300 p-2 print-no-break">
          <strong>Observaciones:</strong> {arqueo.notes}
        </div>
      )}

      {/* Signatures - always at the end, never split across pages */}
      <div className="print-signatures mt-8 pt-4 border-t-2 border-black">
        <div className="grid grid-cols-2 gap-16">
          <div className="text-center">
            <div className="border-b border-black mb-1 h-16" />
            <div className="font-semibold text-[11px] uppercase tracking-wide">
              Cajero
            </div>
            <div className="text-[11px] mt-0.5">
              {arqueo.cashier_name || "_______________"}
            </div>
            <div className="mt-3 text-[9px] text-gray-400">
              DNI: _______________
            </div>
          </div>
          <div className="text-center">
            <div className="border-b border-black mb-1 h-16" />
            <div className="font-semibold text-[11px] uppercase tracking-wide">
              Supervisor / Gerente
            </div>
            <div className="text-[11px] mt-0.5">
              {arqueo.supervisor_name || "_______________"}
            </div>
            <div className="mt-3 text-[9px] text-gray-400">
              DNI: _______________
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-3 border-t border-gray-300 text-center text-[9px] text-gray-400">
        Documento generado el{" "}
        {new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })} -
        Perú On Ice - Sistema POI
      </div>
    </div>
  );
}

function PrintRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: boolean;
}) {
  return (
    <tr className="border-b border-gray-100">
      <td className={`py-0.5 ${sub ? "pl-4 text-gray-500" : ""}`}>
        {label}
      </td>
      <td className="py-0.5 text-right font-mono">{formatCurrency(value)}</td>
    </tr>
  );
}
