"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { validatePinAction } from "@/actions/pin-validation";
import { DECIMAL_UNITS } from "@/lib/constants/sunat";
import { MultiStepForm } from "@/components/ui/multi-step-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AuditSpreadsheet } from "./audit-spreadsheet";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { useCategories } from "@/hooks/queries/use-categories";
import {
  useAuditableItems,
  useCreateAudit,
} from "@/hooks/queries/use-inventory-audits";
import { cn } from "@/lib/utils";
import type { AuditRow } from "@/types/inventory-audit";

const STEPS = [
  { title: "Configuracion" },
  { title: "Conteo" },
  { title: "Resumen" },
];

export function AuditForm() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);

  // Step 0 state
  const [branchId, setBranchId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(false);

  // Step 1 state
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [notes, setNotes] = useState("");

  // Step 2 confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);

  // PIN authorization state
  const [pin, setPin] = useState("");
  const [pinValid, setPinValid] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinUserName, setPinUserName] = useState<string | null>(null);
  const [pinUserCargo, setPinUserCargo] = useState<string | null>(null);
  const [pinUserId, setPinUserId] = useState<string | null>(null);

  useEffect(() => {
    if (pin.length !== 4) {
      setPinValid(false); setPinError(null); setPinUserName(null); setPinUserCargo(null); setPinUserId(null);
      return;
    }
    let cancelled = false;
    setPinLoading(true); setPinError(null);
    validatePinAction(pin).then((result) => {
      if (cancelled) return;
      setPinLoading(false);
      if (!result.valid) { setPinError(result.error || "PIN invalido"); return; }
      const cargo = result.cargo || "";
      if (cargo !== "gerente" && cargo !== "supervisor") {
        setPinError("Solo gerentes o supervisores pueden autorizar");
        return;
      }
      setPinValid(true); setPinUserId(result.user_id || null);
      setPinUserName(result.user_name || null); setPinUserCargo(cargo);
    }).catch(() => { if (!cancelled) { setPinLoading(false); setPinError("Error de conexion"); } });
    return () => { cancelled = true; };
  }, [pin]);

  const { data: branches } = useBranchesForSelect();
  const { data: categories } = useCategories();
  const createMutation = useCreateAudit();

  const {
    data: auditableItems,
    isLoading: isLoadingItems,
    isFetched,
  } = useAuditableItems(
    shouldFetch ? branchId : "",
    categoryId || undefined,
    atRiskOnly,
  );

  // Auto-select if only one branch
  useEffect(() => {
    if (branches?.length === 1 && !branchId) {
      setBranchId(branches[0].id);
    }
  }, [branches, branchId]);

  // When items load, move to step 1
  useEffect(() => {
    if (shouldFetch && isFetched && auditableItems) {
      if (auditableItems.length === 0) {
        toast.error("No se encontraron items para auditar con los filtros seleccionados");
        setShouldFetch(false);
        return;
      }
      setRows(
        auditableItems.map((item) => ({
          ...item,
          physical_stock: null,
          difference: 0,
          cost_impact: 0,
        }))
      );
      setShouldFetch(false);
      setCurrentStep(1);

      // Check for draft
      const draftKey = `poi-audit-draft-${branchId}`;
      const draft = localStorage.getItem(draftKey);
      if (draft) {
        toast("Borrador encontrado", {
          description: "Se encontro un conteo guardado previamente",
          action: {
            label: "Restaurar",
            onClick: () => {
              try {
                const saved = JSON.parse(draft) as AuditRow[];
                // Merge saved physical_stock values into current rows
                setRows((prev) =>
                  prev.map((r) => {
                    const savedRow = saved.find(
                      (s) => s.entity_id === r.entity_id
                    );
                    if (savedRow && savedRow.physical_stock !== null) {
                      const diff =
                        savedRow.physical_stock - r.theoretical_stock;
                      return {
                        ...r,
                        physical_stock: savedRow.physical_stock,
                        difference: diff,
                        cost_impact: diff * r.cost_price,
                      };
                    }
                    return r;
                  })
                );
                toast.success("Borrador restaurado");
              } catch {
                toast.error("No se pudo restaurar el borrador");
              }
            },
          },
        });
      }
    }
  }, [shouldFetch, isFetched, auditableItems, branchId]);

  // Auto-save to localStorage
  useEffect(() => {
    if (currentStep === 1 && branchId && rows.length > 0) {
      const hasAnyCount = rows.some((r) => r.physical_stock !== null);
      if (hasAnyCount) {
        const draftKey = `poi-audit-draft-${branchId}`;
        localStorage.setItem(draftKey, JSON.stringify(rows));
      }
    }
  }, [rows, currentStep, branchId]);

  const handleLoadItems = () => {
    if (!branchId) {
      toast.error("Selecciona una sede");
      return;
    }
    setShouldFetch(true);
  };

  const handlePhysicalStockChange = useCallback(
    (entityId: string, value: number) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.entity_id !== entityId) return r;
          const diff = Math.round((value - r.theoretical_stock) * 10000) / 10000;
          return {
            ...r,
            physical_stock: value,
            difference: diff,
            cost_impact: Math.round(diff * r.cost_price * 100) / 100,
          };
        })
      );
    },
    []
  );

  const counted = rows.filter((r) => r.physical_stock !== null).length;
  const total = rows.length;
  const progressPercent = total > 0 ? (counted / total) * 100 : 0;

  const adjustedRows = rows.filter(
    (r) => r.physical_stock !== null && r.difference !== 0
  );
  const totalImpact = adjustedRows.reduce((acc, r) => acc + r.cost_impact, 0);

  const handleNext = () => {
    if (currentStep === 1 && counted === 0) {
      toast.error("Cuenta al menos un item antes de continuar");
      return;
    }
    // Validate: integer-only units must not have decimal values
    if (currentStep === 1) {
      const invalidItems = rows.filter(
        (r) =>
          r.physical_stock !== null &&
          !DECIMAL_UNITS.has(r.unit_of_measure) &&
          !Number.isInteger(r.physical_stock)
      );
      if (invalidItems.length > 0) {
        const names = invalidItems.map((r) => r.entity_name).join(", ");
        toast.error(`Los siguientes items no aceptan decimales (unidad entera): ${names}`);
        return;
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = () => {
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    const items = rows
      .filter((r) => r.physical_stock !== null)
      .map((r) => ({
        entity_id: r.entity_id,
        entity_type: r.entity_type,
        entity_name: r.entity_name,
        entity_sku: r.entity_sku,
        theoretical_stock: r.theoretical_stock,
        physical_stock: r.physical_stock as number,
        difference: r.difference,
        cost_impact: r.cost_impact,
        cost_price: r.cost_price,
      }));

    const result = await createMutation.mutateAsync({
      branch_id: branchId,
      items,
      notes: notes || undefined,
      responsible_id: pinUserId || undefined,
    });

    if (result.success) {
      // Clear draft
      const draftKey = `poi-audit-draft-${branchId}`;
      localStorage.removeItem(draftKey);
      toast.success("Auditoria guardada exitosamente");
      setConfirmOpen(false);
      router.push("/inventario/auditoria");
    } else {
      toast.error(
        typeof result.error === "string"
          ? result.error
          : "Error al guardar la auditoria"
      );
      setConfirmOpen(false);
    }
  };

  const impactLabel =
    totalImpact < 0
      ? "merma"
      : totalImpact > 0
        ? "sobrante"
        : "sin impacto";

  const selectedBranchName = branches?.find((b) => b.id === branchId)?.name;

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <MultiStepForm steps={STEPS} currentStep={currentStep}>
        {/* ----------------------------------------------------------------- */}
        {/* Step 0: Configuracion                                             */}
        {/* ----------------------------------------------------------------- */}
        {currentStep === 0 && (
          <div className="space-y-6">
            {/* Branch selector */}
            <div className="space-y-2">
              <Label>Sede *</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una sede" />
                </SelectTrigger>
                <SelectContent>
                  {branches?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category filter */}
            <div className="space-y-2">
              <Label>Categoria (opcional)</Label>
              <Select value={categoryId || "all"} onValueChange={(v) => setCategoryId(v === "all" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas las categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorias</SelectItem>
                  {categories?.map((cat: { id: string; name: string }) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* At-risk toggle */}
            <div className="flex items-center gap-3">
              <Switch
                checked={atRiskOnly}
                onCheckedChange={setAtRiskOnly}
                id="at-risk-only"
              />
              <Label htmlFor="at-risk-only" className="cursor-pointer">
                Solo items en riesgo (+30 dias sin auditar)
              </Label>
            </div>

            {/* Load items button */}
            <Button
              type="button"
              onClick={handleLoadItems}
              disabled={!branchId || isLoadingItems}
            >
              {isLoadingItems && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {isLoadingItems ? "Cargando items..." : "Cargar items"}
            </Button>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Step 1: Conteo                                                    */}
        {/* ----------------------------------------------------------------- */}
        {currentStep === 1 && (
          <div className="space-y-4">
            {/* Progress indicator */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {counted} de {total} items contados
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {progressPercent.toFixed(0)}%
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>

            <p className="text-xs text-muted-foreground">
              Use TAB o ENTER para saltar entre campos
            </p>

            <AuditSpreadsheet
              rows={rows}
              onChange={handlePhysicalStockChange}
            />
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Step 2: Resumen de Impacto                                        */}
        {/* ----------------------------------------------------------------- */}
        {currentStep === 2 && (
          <div className="space-y-6">
            {adjustedRows.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No se encontraron diferencias. El inventario coincide con el
                  sistema.
                </p>
              </div>
            ) : (
              <>
                {/* Summary table */}
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                          SKU
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                          Nombre
                        </th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                          Teorico
                        </th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                          Fisico
                        </th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                          Diferencia
                        </th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                          Impacto (S/)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {adjustedRows.map((row) => (
                        <tr
                          key={row.entity_id}
                          className="border-b border-border/50 even:bg-muted/5"
                        >
                          <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                            {row.entity_sku}
                          </td>
                          <td className="px-3 py-1.5 font-medium truncate max-w-[200px]">
                            {row.entity_name}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {Number.isInteger(row.theoretical_stock) ? row.theoretical_stock : row.theoretical_stock.toFixed(2)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {Number.isInteger(row.physical_stock) ? row.physical_stock : Number(row.physical_stock).toFixed(2)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-1.5 text-right tabular-nums font-semibold",
                              row.difference < 0
                                ? "text-destructive"
                                : "text-amber-400"
                            )}
                          >
                            {row.difference > 0
                              ? `+${Number.isInteger(row.difference) ? row.difference : row.difference.toFixed(2)}`
                              : (Number.isInteger(row.difference) ? String(row.difference) : row.difference.toFixed(2))}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-1.5 text-right tabular-nums font-semibold",
                              row.cost_impact < 0
                                ? "text-destructive"
                                : "text-amber-400"
                            )}
                          >
                            {row.cost_impact < 0 ? "-" : "+"}S/{" "}
                            {Math.abs(row.cost_impact).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/20">
                        <td
                          colSpan={4}
                          className="px-3 py-2 text-right text-sm font-semibold text-foreground"
                        >
                          Total: {adjustedRows.length} items ajustados
                        </td>
                        <td className="px-3 py-2" />
                        <td
                          className={cn(
                            "px-3 py-2 text-right tabular-nums text-sm font-bold",
                            totalImpact < 0
                              ? "text-destructive"
                              : totalImpact > 0
                                ? "text-amber-400"
                                : "text-muted-foreground"
                          )}
                        >
                          {totalImpact < 0 ? "-" : totalImpact > 0 ? "+" : ""}
                          S/ {Math.abs(totalImpact).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="audit-notes">Notas (opcional)</Label>
              <Textarea
                id="audit-notes"
                placeholder="Observaciones adicionales sobre la auditoria..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* PIN authorization */}
            <div className="space-y-2 pt-2 border-t">
              <Label>PIN de autorizacion *</Label>
              <p className="text-xs text-muted-foreground">Ingresa el PIN de un gerente o supervisor para aprobar</p>
              <div className="relative max-w-[200px]">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className={cn(
                    "flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm text-center font-mono tracking-[0.5em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    pinValid && "border-emerald-500/50 bg-emerald-500/5",
                    pinError && !pinLoading && "border-destructive/50 bg-destructive/5",
                  )}
                />
                {pinLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />}
                {pinValid && <ShieldCheck className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-emerald-500" />}
                {pinError && !pinLoading && <ShieldX className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-destructive" />}
              </div>
              {pinValid && pinUserName && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 max-w-xs">
                  <ShieldCheck className="size-3.5 text-emerald-500 shrink-0" />
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{pinUserName}</span>
                  <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">{pinUserCargo}</span>
                </div>
              )}
              {pinError && !pinLoading && (
                <p className="text-xs text-destructive">{pinError}</p>
              )}
            </div>
          </div>
        )}
      </MultiStepForm>

      {/* Navigation buttons */}
      <div className="mt-8 flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={
            currentStep === 0
              ? () => router.push("/inventario/auditoria")
              : handleBack
          }
        >
          {currentStep === 0 ? "Cancelar" : "Atras"}
        </Button>
        {currentStep === 1 && (
          <Button type="button" onClick={handleNext} disabled={counted === 0}>
            Siguiente
          </Button>
        )}
        {currentStep === 2 && (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={createMutation.isPending || !pinValid}
          >
            {createMutation.isPending
              ? "Guardando..."
              : "Guardar y Ajustar Inventario"}
          </Button>
        )}
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar auditoria"
        description={`Se ajustara el stock de ${adjustedRows.length} items. Esto generara una ${impactLabel} contable de S/ ${Math.abs(totalImpact).toFixed(2)}. ¿Desea confirmar?`}
        confirmLabel="Confirmar auditoria"
        onConfirm={handleConfirm}
        isLoading={createMutation.isPending}
      />
    </form>
  );
}
