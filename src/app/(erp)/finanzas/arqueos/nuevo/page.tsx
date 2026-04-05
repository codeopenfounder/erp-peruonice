"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Minus,
  Plus,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X as XIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { useCashRegisterStatuses } from "@/hooks/queries/use-gastos";
import {
  useOpenRegisterSummary,
  useCreateSurpriseArqueo,
} from "@/hooks/queries/use-arqueos";
import { validatePinAction } from "@/actions/pin-validation";
import { toast } from "sonner";

const DENOMINATIONS = [
  { value: 200, label: "S/ 200" },
  { value: 100, label: "S/ 100" },
  { value: 50, label: "S/ 50" },
  { value: 20, label: "S/ 20" },
  { value: 10, label: "S/ 10" },
  { value: 5, label: "S/ 5" },
  { value: 2, label: "S/ 2" },
  { value: 1, label: "S/ 1" },
  { value: 0.5, label: "S/ 0.50" },
  { value: 0.2, label: "S/ 0.20" },
  { value: 0.1, label: "S/ 0.10" },
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
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--";
  }
}

export default function NuevoArqueoPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string | null>(
    null
  );
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState("");
  const [pinDigits, setPinDigits] = useState(["", "", "", ""]);
  const [pinValidating, setPinValidating] = useState(false);
  const [pinResult, setPinResult] = useState<{
    valid: boolean;
    user_id?: string;
    user_name?: string;
    cargo?: string;
  } | null>(null);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const { data: registers } = useCashRegisterStatuses();
  const { data: summary, isLoading: isSummaryLoading } =
    useOpenRegisterSummary(selectedRegisterId);
  const createMutation = useCreateSurpriseArqueo();

  const openRegisters = useMemo(
    () => (registers || []).filter((r) => r.is_open),
    [registers]
  );

  const totalCounted = useMemo(
    () =>
      DENOMINATIONS.reduce(
        (sum, d) => sum + d.value * (counts[d.value] || 0),
        0
      ),
    [counts]
  );

  const expectedAmount = summary?.expected_amount ?? 0;
  const difference = totalCounted - expectedAmount;
  const absDiff = Math.abs(difference);
  const requiresNotes = difference !== 0;

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

  const pinComplete = pinDigits.every((d) => d !== "");
  const isSupervisorValid =
    pinResult?.valid === true &&
    (pinResult.cargo === "gerente" || pinResult.cargo === "supervisor");

  const canSubmit =
    !createMutation.isPending &&
    isSupervisorValid &&
    (!requiresNotes || notes.trim().length > 0);

  const updateCount = (value: number, count: number) => {
    setCounts((prev) => ({ ...prev, [value]: Math.max(0, count) }));
  };

  const handlePinChange = useCallback(
    (index: number, char: string) => {
      const digit = char.replace(/\D/g, "").slice(-1);
      const newDigits = [...pinDigits];
      newDigits[index] = digit;
      setPinDigits(newDigits);
      setPinResult(null);

      if (digit && index < 3) {
        pinRefs.current[index + 1]?.focus();
      }

      const pin = newDigits.join("");
      if (/^\d{4}$/.test(pin)) {
        setPinValidating(true);
        validatePinAction(pin)
          .then((result) => setPinResult(result))
          .catch(() => setPinResult({ valid: false }))
          .finally(() => setPinValidating(false));
      }
    },
    [pinDigits]
  );

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
      pinRefs.current[index - 1]?.focus();
    }
  };

  const handlePinPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    const newDigits = pasted.padEnd(4, "").split("").slice(0, 4);
    setPinDigits(newDigits);
    setPinResult(null);
    const focusIdx = Math.min(pasted.length, 3);
    pinRefs.current[focusIdx]?.focus();

    if (/^\d{4}$/.test(pasted)) {
      setPinValidating(true);
      validatePinAction(pasted)
        .then((result) => setPinResult(result))
        .catch(() => setPinResult({ valid: false }))
        .finally(() => setPinValidating(false));
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || !selectedRegisterId || !pinResult?.user_id) return;

    const denomCounts: Record<string, number> = {};
    for (const [k, v] of Object.entries(counts)) {
      if (Number(v) > 0) denomCounts[String(k)] = Number(v);
    }

    const result = await createMutation.mutateAsync({
      cash_register_id: selectedRegisterId,
      denomination_counts: denomCounts,
      counted_amount: totalCounted,
      supervisor_id: pinResult.user_id,
      supervisor_name: pinResult.user_name || "",
      notes: notes.trim() || undefined,
    });

    if (result.success && result.data) {
      toast.success("Arqueo sorpresa registrado");
      router.push(`/finanzas/arqueos/${result.data.id}`);
    } else {
      toast.error(result.error || "Error al registrar arqueo");
    }
  };

  const config = statusConfig[diffStatus];
  const StatusIcon = config.icon;

  const STEPS = [
    { number: 0, label: "Seleccionar Caja" },
    { number: 1, label: "Conteo" },
    { number: 2, label: "Confirmar" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nuevo Arqueo Sorpresa"
        description="Realiza una auditoria de efectivo no programada"
        actions={
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 size-4" />
            Cancelar
          </Button>
        }
      />

      {/* Stepper */}
      <div className="flex items-center justify-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s.number} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex size-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  step === s.number
                    ? "bg-primary text-primary-foreground"
                    : step > s.number
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {step > s.number ? (
                  <Check className="size-3.5" />
                ) : (
                  s.number + 1
                )}
              </div>
              <span
                className={`text-[10px] mt-1 font-medium transition-colors ${
                  step === s.number
                    ? "text-primary"
                    : step > s.number
                      ? "text-primary/60"
                      : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-16 mx-3 mb-4 transition-colors ${
                  step > s.number ? "bg-primary/40" : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="max-w-2xl mx-auto">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="step-0"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Selecciona la caja a auditar
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {openRegisters.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="text-sm">No hay cajas abiertas para auditar</p>
                    </div>
                  ) : (
                    <>
                      <Select
                        value={selectedRegisterId || ""}
                        onValueChange={(v) => setSelectedRegisterId(v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una caja..." />
                        </SelectTrigger>
                        <SelectContent>
                          {openRegisters.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name} ({r.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {selectedRegisterId && isSummaryLoading && (
                        <Skeleton className="h-24 rounded-lg" />
                      )}

                      {summary && (
                        <div className="rounded-lg border border-border/50 p-4 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Cajero
                            </span>
                            <span className="font-medium">
                              {summary.opened_by_name || "--"}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Apertura
                            </span>
                            <span className="font-mono text-xs">
                              {formatDateTime(summary.opened_at)}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Fondo inicial
                            </span>
                            <span className="font-mono tabular-nums">
                              {formatCurrency(summary.opening_amount)}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Comprobantes
                            </span>
                            <span>{summary.sale_count}</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button
                  disabled={!summary}
                  onClick={() => setStep(1)}
                >
                  Continuar
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Conteo por denominacion
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {DENOMINATIONS.map((d) => {
                      const qty = counts[d.value] || 0;
                      const subtotal = d.value * qty;
                      return (
                        <div
                          key={d.value}
                          className="flex items-center gap-3"
                        >
                          <span className="w-20 text-sm font-mono shrink-0">
                            {d.label}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="icon"
                              className="size-7"
                              onClick={() => updateCount(d.value, qty - 1)}
                            >
                              <Minus className="size-3" />
                            </Button>
                            <input
                              type="number"
                              min="0"
                              value={qty}
                              onChange={(e) =>
                                updateCount(
                                  d.value,
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="w-14 rounded-lg border border-border bg-card px-2 py-1 text-center text-sm font-mono outline-none focus:border-primary transition-colors"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="size-7"
                              onClick={() => updateCount(d.value, qty + 1)}
                            >
                              <Plus className="size-3" />
                            </Button>
                          </div>
                          <span className="ml-auto text-sm font-mono text-muted-foreground tabular-nums">
                            {subtotal.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Running totals */}
              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Total contado
                    </span>
                    <span className="font-bold font-mono tabular-nums">
                      {formatCurrency(totalCounted)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Total esperado
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(expectedAmount)}
                    </span>
                  </div>
                  <div className="border-t border-border pt-2 flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Diferencia
                    </span>
                    <span
                      className={`font-bold font-mono tabular-nums ${config.text}`}
                    >
                      {difference > 0 ? "+" : ""}
                      {formatCurrency(difference)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(0)}>
                  <ArrowLeft className="mr-2 size-4" />
                  Volver
                </Button>
                <Button onClick={() => setStep(2)}>
                  Continuar
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Result */}
              <Card className={`border ${config.bg}`}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <StatusIcon className={`size-5 ${config.text}`} />
                    <span
                      className={`text-sm font-semibold ${config.text}`}
                    >
                      {config.label}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-muted-foreground">
                        Efectivo esperado
                      </span>
                      <span className="text-lg font-bold font-mono tabular-nums">
                        {formatCurrency(expectedAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-muted-foreground">
                        Efectivo contado
                      </span>
                      <span className="text-lg font-bold font-mono tabular-nums">
                        {formatCurrency(totalCounted)}
                      </span>
                    </div>
                    <div className="border-t border-border/50 my-2" />
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-medium">
                        Diferencia
                      </span>
                      <span
                        className={`text-xl font-bold font-mono tabular-nums ${config.text}`}
                      >
                        {difference > 0 ? "+" : ""}
                        {formatCurrency(difference)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      Observaciones
                      {requiresNotes && (
                        <span className="text-destructive ml-1">*</span>
                      )}
                    </label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={
                        requiresNotes
                          ? "Explique la diferencia encontrada..."
                          : "Observaciones adicionales (opcional)..."
                      }
                      rows={3}
                    />
                    {requiresNotes && notes.trim().length === 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Obligatorio cuando existe diferencia
                      </p>
                    )}
                  </div>

                  {/* PIN */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <label className="text-sm font-medium">
                        PIN del supervisor
                        <span className="text-destructive ml-1">*</span>
                      </label>
                      {pinComplete && !pinValidating && pinResult && (
                        <span className="flex items-center gap-1">
                          {pinResult.valid ? (
                            <Check className="size-3.5 text-emerald-500" />
                          ) : (
                            <XIcon className="size-3.5 text-red-500" />
                          )}
                        </span>
                      )}
                      {pinValidating && (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    <div
                      className="flex gap-3 justify-center"
                      onPaste={handlePinPaste}
                    >
                      {[0, 1, 2, 3].map((i) => (
                        <input
                          key={i}
                          ref={(el) => {
                            pinRefs.current[i] = el;
                          }}
                          type="password"
                          inputMode="numeric"
                          maxLength={1}
                          value={pinDigits[i]}
                          onChange={(e) =>
                            handlePinChange(i, e.target.value)
                          }
                          onKeyDown={(e) => handlePinKeyDown(i, e)}
                          className={`w-12 h-12 text-center text-xl font-mono rounded-xl border-2 bg-background outline-none transition-all duration-200 focus:ring-2 focus:ring-primary/30 focus:border-primary ${
                            pinComplete && pinResult
                              ? pinResult.valid
                                ? "border-emerald-500/50"
                                : "border-red-500/50"
                              : "border-border"
                          }`}
                        />
                      ))}
                    </div>
                    {pinResult?.valid && pinResult.user_name && (
                      <p className="text-xs text-emerald-500 text-center mt-1.5">
                        Supervisor: {pinResult.user_name}
                      </p>
                    )}
                    {pinComplete &&
                      !pinValidating &&
                      pinResult &&
                      !pinResult.valid && (
                        <p className="text-xs text-red-500 text-center mt-1.5">
                          PIN inválido
                        </p>
                      )}
                    {pinComplete &&
                      !pinValidating &&
                      pinResult?.valid &&
                      !isSupervisorValid && (
                        <p className="text-xs text-red-500 text-center mt-1.5">
                          Solo supervisores o gerentes pueden autorizar
                        </p>
                      )}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 size-4" />
                  Volver
                </Button>
                <Button
                  disabled={!canSubmit}
                  onClick={handleSubmit}
                  className="min-w-[160px]"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Registrando...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 size-4" />
                      Registrar Arqueo
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
