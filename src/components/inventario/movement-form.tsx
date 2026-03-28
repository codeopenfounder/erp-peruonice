"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Package, FlaskConical, Check, Scale, ShieldCheck, ShieldX, Loader2 as PinLoader } from "lucide-react";
import { validatePinAction } from "@/actions/pin-validation";
import { DECIMAL_UNITS, SUNAT_UNITS_OF_MEASURE } from "@/lib/constants/sunat";
import {
  createInventoryMovementSchema,
  type CreateInventoryMovementSchemaType,
} from "@/lib/validators/inventory-movement";
import { MultiStepForm } from "@/components/ui/multi-step-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MovementTypeBadge } from "./movement-type-badge";
import { useCreateInventoryMovement } from "@/hooks/queries/use-inventory-movements";
import { useProducts } from "@/hooks/queries/use-products";
import { useSupplies } from "@/hooks/queries/use-supplies";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";

const STEPS = [
  { title: "Seleccionar entidad" },
  { title: "Detalles" },
  { title: "Confirmacion" },
];

const MOVEMENT_TYPES = [
  { value: "waste", label: "Merma" },
  { value: "shrinkage", label: "Perdida/Robo" },
  { value: "staff_consumption", label: "Consumo Personal" },
  { value: "breakage", label: "Rotura" },
  { value: "adjustment", label: "Ajuste" },
  { value: "income", label: "Ingreso" },
  { value: "outcome", label: "Egreso" },
  { value: "cortesia", label: "Cortesia" },
] as const;

export function MovementForm() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [entitySearch, setEntitySearch] = useState("");
  const [selectedEntityName, setSelectedEntityName] = useState("");
  const [selectedEntitySku, setSelectedEntitySku] = useState("");
  const [selectedEntityUom, setSelectedEntityUom] = useState("NIU");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // PIN authorization state
  const [pin, setPin] = useState("");
  const [pinValid, setPinValid] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinUserName, setPinUserName] = useState<string | null>(null);
  const [pinUserCargo, setPinUserCargo] = useState<string | null>(null);
  const [pinUserId, setPinUserId] = useState<string | null>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  // Auto-validate PIN at 4 digits
  useEffect(() => {
    if (pin.length !== 4) {
      setPinValid(false);
      setPinError(null);
      setPinUserName(null);
      setPinUserCargo(null);
      setPinUserId(null);
      return;
    }
    let cancelled = false;
    setPinLoading(true);
    setPinError(null);
    validatePinAction(pin).then((result) => {
      if (cancelled) return;
      setPinLoading(false);
      if (!result.valid) { setPinError(result.error || "PIN invalido"); return; }
      const cargo = result.cargo || "";
      if (cargo !== "gerente" && cargo !== "supervisor") {
        setPinError("Solo gerentes o supervisores pueden autorizar");
        return;
      }
      setPinValid(true);
      setPinUserId(result.user_id || null);
      setPinUserName(result.user_name || null);
      setPinUserCargo(cargo);
    }).catch(() => {
      if (cancelled) return;
      setPinLoading(false);
      setPinError("Error de conexion");
    });
    return () => { cancelled = true; };
  }, [pin]);

  const createMutation = useCreateInventoryMovement();
  const { data: branches } = useBranchesForSelect();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<CreateInventoryMovementSchemaType>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createInventoryMovementSchema) as any,
    defaultValues: {
      entity_type: "product",
      entity_id: "",
      quantity: 1,
      movement_type: "waste",
      reason: "",
      notes: "",
      branch_id: "",
    },
  });

  // Auto-select if only one branch
  useEffect(() => {
    if (branches?.length === 1 && !watch("branch_id")) {
      setValue("branch_id", branches[0].id);
    }
  }, [branches, setValue, watch]);

  const entityType = watch("entity_type");
  const entityId = watch("entity_id");
  const quantity = watch("quantity");
  const movementType = watch("movement_type");
  const reason = watch("reason");
  const notes = watch("notes");
  const branchId = watch("branch_id");

  // Queries for entity search
  const productFilters = useMemo(
    () => ({
      type: "product" as const,
      search: entitySearch || undefined,
      page: 1,
      page_size: 10,
    }),
    [entitySearch]
  );

  const supplyFilters = useMemo(
    () => ({
      search: entitySearch || undefined,
      is_active: true,
      page: 1,
      page_size: 10,
    }),
    [entitySearch]
  );

  const { data: productData } = useProducts(productFilters);
  const { data: supplyData } = useSupplies(supplyFilters);

  const entityResults = entityType === "product" ? productData?.data : supplyData?.data;

  const allowDecimals = DECIMAL_UNITS.has(selectedEntityUom);

  const handleEntitySelect = (id: string, name: string, sku: string, uom: string) => {
    setValue("entity_id", id);
    setSelectedEntityName(name);
    setSelectedEntitySku(sku);
    setSelectedEntityUom(uom || "NIU");
    setEntitySearch(name);
    setDropdownOpen(false);
  };

  const handleEntityTypeChange = (type: "product" | "supply") => {
    setValue("entity_type", type);
    setValue("entity_id", "");
    setSelectedEntityName("");
    setSelectedEntitySku("");
    setSelectedEntityUom("NIU");
    setEntitySearch("");
  };

  const handleNext = async () => {
    if (currentStep === 0) {
      const valid = await trigger(["entity_type", "entity_id", "quantity", "branch_id"]);
      if (!valid) return;
    }
    if (currentStep === 1) {
      const valid = await trigger(["movement_type"]);
      if (!valid) return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const onSubmit = async (data: CreateInventoryMovementSchemaType) => {
    if (!pinValid || !pinUserId) {
      toast.error("Se requiere autorizacion por PIN");
      return;
    }
    const payload: Record<string, unknown> = {
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      quantity: data.quantity,
      movement_type: data.movement_type,
      branch_id: data.branch_id,
      responsible_id: pinUserId,
    };
    if (data.reason) payload.reason = data.reason;
    if (data.notes) payload.notes = data.notes;

    const result = await createMutation.mutateAsync(payload);
    if (result.success) {
      toast.success("Movimiento registrado");
      router.push("/inventario/movimientos");
    } else {
      toast.error(
        typeof result.error === "string" ? result.error : "Error al crear movimiento"
      );
    }
  };

  const selectedBranchName = branches?.find((b) => b.id === branchId)?.name;
  const selectedMovementLabel = MOVEMENT_TYPES.find((m) => m.value === movementType)?.label;

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <MultiStepForm steps={STEPS} currentStep={currentStep}>
        {/* ----------------------------------------------------------------- */}
        {/* Step 0: Seleccionar entidad                                       */}
        {/* ----------------------------------------------------------------- */}
        {currentStep === 0 && (
          <div className="space-y-6">
            {/* Entity type selector */}
            <div className="space-y-2">
              <Label>Tipo de entidad</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleEntityTypeChange("product")}
                  className={`flex flex-1 items-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                    entityType === "product"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <Package className="size-4" />
                  Producto
                </button>
                <button
                  type="button"
                  onClick={() => handleEntityTypeChange("supply")}
                  className={`flex flex-1 items-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                    entityType === "supply"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <FlaskConical className="size-4" />
                  Insumo
                </button>
              </div>
            </div>

            {/* Entity search */}
            <div className="space-y-2">
              <Label>
                {entityType === "product" ? "Buscar producto" : "Buscar insumo"}
              </Label>
              <div className="relative">
                <Input
                  placeholder={
                    entityType === "product"
                      ? "Escribe para buscar un producto..."
                      : "Escribe para buscar un insumo..."
                  }
                  value={entitySearch}
                  onChange={(e) => {
                    setEntitySearch(e.target.value);
                    setDropdownOpen(true);
                    if (!e.target.value) {
                      setValue("entity_id", "");
                      setSelectedEntityName("");
                      setSelectedEntitySku("");
                    }
                  }}
                  onFocus={() => setDropdownOpen(true)}
                />
                {dropdownOpen && entitySearch && entityResults && entityResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg">
                    <div className="max-h-[200px] overflow-y-auto py-1">
                      {entityResults.map((item) => {
                        const itemId = item.id;
                        const itemName = item.name;
                        const itemSku = item.sku;
                        const isSelected = entityId === itemId;
                        return (
                          <button
                            key={itemId}
                            type="button"
                            onClick={() => handleEntitySelect(itemId, itemName, itemSku, "unit_of_measure" in item ? (item.unit_of_measure as string) : "NIU")}
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50 ${
                              isSelected ? "bg-primary/10 text-primary" : "text-foreground"
                            }`}
                          >
                            <div>
                              <p className="font-medium">{itemName}</p>
                              <p className="text-[10px] font-mono text-muted-foreground">
                                {itemSku}
                              </p>
                            </div>
                            {isSelected && <Check className="size-4 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {dropdownOpen && entitySearch && entityResults && entityResults.length === 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover p-3 text-center text-sm text-muted-foreground shadow-lg">
                    No se encontraron resultados
                  </div>
                )}
              </div>
              {entityId && (
                <p className="text-xs text-muted-foreground">
                  Seleccionado: <span className="font-medium text-foreground">{selectedEntityName}</span>{" "}
                  <span className="font-mono">({selectedEntitySku})</span>
                </p>
              )}
              {errors.entity_id && (
                <p className="text-xs text-destructive">{errors.entity_id.message}</p>
              )}
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label htmlFor="quantity">Cantidad {entityId && <span className="text-muted-foreground font-normal">({(SUNAT_UNITS_OF_MEASURE as Record<string, string>)[selectedEntityUom] || selectedEntityUom})</span>}</Label>
              <Input
                id="quantity"
                type="number"
                min={allowDecimals ? 0.001 : 1}
                step={allowDecimals ? "any" : "1"}
                {...register("quantity")}
                className="max-w-[180px]"
              />
              {errors.quantity && (
                <p className="text-xs text-destructive">{errors.quantity.message}</p>
              )}
            </div>

            {/* Branch */}
            <div className="space-y-2">
              <Label>Sede *</Label>
              <Select
                value={branchId || ""}
                onValueChange={(v) => setValue("branch_id", v)}
              >
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
              {errors.branch_id && (
                <p className="text-xs text-destructive">{errors.branch_id.message}</p>
              )}
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Step 1: Detalles                                                  */}
        {/* ----------------------------------------------------------------- */}
        {currentStep === 1 && (
          <div className="space-y-6">
            {/* Movement type */}
            <div className="space-y-2">
              <Label>Tipo de movimiento</Label>
              <Select
                value={movementType}
                onValueChange={(v) =>
                  setValue(
                    "movement_type",
                    v as CreateInventoryMovementSchemaType["movement_type"]
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  {MOVEMENT_TYPES.map((mt) => (
                    <SelectItem key={mt.value} value={mt.value}>
                      {mt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.movement_type && (
                <p className="text-xs text-destructive">{errors.movement_type.message}</p>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="reason">Motivo (opcional)</Label>
              <Textarea
                id="reason"
                placeholder="Describe brevemente el motivo del movimiento..."
                {...register("reason")}
                rows={3}
              />
              {errors.reason && (
                <p className="text-xs text-destructive">{errors.reason.message}</p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notas adicionales (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Informacion adicional..."
                {...register("notes")}
                rows={2}
              />
              {errors.notes && (
                <p className="text-xs text-destructive">{errors.notes.message}</p>
              )}
            </div>

          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Step 2: Confirmacion                                              */}
        {/* ----------------------------------------------------------------- */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Resumen del movimiento</h3>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Entidad</span>
                <span className="text-sm font-medium text-foreground">
                  {entityType === "product" ? "Producto" : "Insumo"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Nombre</span>
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">{selectedEntityName}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{selectedEntitySku}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Cantidad</span>
                <span className="font-mono text-sm font-semibold">{quantity}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tipo</span>
                <MovementTypeBadge type={movementType} />
              </div>
              {reason && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-muted-foreground shrink-0">Motivo</span>
                  <span className="text-sm text-foreground text-right">{reason}</span>
                </div>
              )}
              {notes && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-muted-foreground shrink-0">Notas</span>
                  <span className="text-sm text-foreground text-right">{notes}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Sede</span>
                <span className="text-sm text-foreground">{selectedBranchName || "\u2014"}</span>
              </div>
            </div>
            {/* PIN authorization */}
            <div className="mt-4">
              <Label className="text-sm font-medium">PIN de autorizacion *</Label>
              <p className="text-xs text-muted-foreground mb-2">Ingresa el PIN de un gerente o supervisor</p>
              <div className="relative max-w-[200px]">
                <Input
                  ref={pinRef}
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className={`text-center font-mono tracking-[0.5em] ${
                    pinValid
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : pinError
                        ? "border-destructive/50 bg-destructive/5"
                        : ""
                  }`}
                />
                {pinLoading && <PinLoader className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />}
                {pinValid && <ShieldCheck className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-emerald-500" />}
                {pinError && !pinLoading && <ShieldX className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-destructive" />}
              </div>
              {pinValid && pinUserName && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                  <ShieldCheck className="size-3.5 text-emerald-500 shrink-0" />
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{pinUserName}</span>
                  <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">{pinUserCargo}</span>
                </div>
              )}
              {pinError && !pinLoading && (
                <p className="mt-1.5 text-xs text-destructive">{pinError}</p>
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
          onClick={currentStep === 0 ? () => router.push("/inventario/movimientos") : handleBack}
        >
          {currentStep === 0 ? "Cancelar" : "Atras"}
        </Button>
        {currentStep < STEPS.length - 1 ? (
          <Button type="button" onClick={handleNext}>
            Siguiente
          </Button>
        ) : (
          <Button type="button" disabled={createMutation.isPending || !pinValid} onClick={handleSubmit(onSubmit)}>
            {createMutation.isPending ? "Creando..." : "Crear movimiento"}
          </Button>
        )}
      </div>
    </form>
  );
}
