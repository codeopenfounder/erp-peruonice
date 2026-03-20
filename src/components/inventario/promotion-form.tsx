"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Check, Info, MapPin, Tag, FolderOpen, Search, Trash2, Package } from "lucide-react";
import { MultiStepForm } from "@/components/ui/multi-step-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPromotionSchema, type CreatePromotionSchemaType } from "@/lib/validators/promotion";
import { useCategories } from "@/hooks/queries/use-categories";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { useProducts } from "@/hooks/queries/use-products";
import { useCreatePromotion, useUpdatePromotion } from "@/hooks/queries/use-promotions";
import type { PromotionDetail } from "@/types/promotion";

// Convert UTC ISO timestamp to datetime-local input format (uses browser's Peru timezone)
function toDatetimeLocal(utc: string | null | undefined): string {
  if (!utc) return "";
  const d = new Date(utc);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface PromotionFormProps {
  promotion?: PromotionDetail | null;
}

interface ComboItem {
  product_id: string;
  quantity: number;
  name: string;
  sku: string;
  unit_price: number;
}

const COMBO_STEPS = [
  { title: "Datos basicos" },
  { title: "Productos del combo" },
  { title: "Requisitos y sede" },
  { title: "Tiempo" },
  { title: "Confirmacion" },
];

const NORMAL_STEPS = [
  { title: "Datos basicos" },
  { title: "Requisitos y sede" },
  { title: "Categorias y etiquetas" },
  { title: "Tiempo" },
  { title: "Confirmacion" },
];

export function PromotionForm({ promotion }: PromotionFormProps) {
  const isEditing = !!promotion;
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);

  // Combo state
  const [isCombo, setIsCombo] = useState(promotion?.is_combo ?? false);
  const [comboItems, setComboItems] = useState<ComboItem[]>(() => {
    if (promotion?.is_combo && promotion.combo_items?.length) {
      return promotion.combo_items.map((ci) => ({
        product_id: ci.product_id,
        quantity: ci.quantity,
        name: ci.product_name ?? "",
        sku: ci.product_sku ?? "",
        unit_price: ci.product_price ?? 0,
      }));
    }
    return [];
  });
  const [comboSearch, setComboSearch] = useState("");
  const [comboDropdownOpen, setComboDropdownOpen] = useState(false);

  const steps = isCombo ? COMBO_STEPS : NORMAL_STEPS;

  const createMutation = useCreatePromotion();
  const updateMutation = useUpdatePromotion();
  const { data: branches } = useBranchesForSelect();

  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(promotion?.category_filters.map((f) => f.category_id) ?? [])
  );
  const [selectedTags, setSelectedTags] = useState<Set<string>>(
    new Set(promotion?.tag_filters.map((f) => f.tag_id) ?? [])
  );
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(
    new Set(promotion?.branch_filters.map((f) => f.branch_id) ?? [])
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreatePromotionSchemaType>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createPromotionSchema) as any,
    defaultValues: {
      code: promotion?.code ?? "",
      name: promotion?.name ?? "",
      description: promotion?.description ?? "",
      discount_type: promotion?.discount_type ?? "percentage",
      discount_value: promotion?.discount_value ?? undefined,
      applies_to: promotion?.applies_to ?? "all",
      min_purchase_amount: promotion?.min_purchase_amount ?? undefined,
      max_discount_amount: promotion?.max_discount_amount ?? undefined,
      min_quantity: promotion?.min_quantity ?? undefined,
      applies_every: promotion?.applies_every ?? 0,
      stock: promotion?.stock ?? undefined,
      max_uses_per_customer: promotion?.max_uses_per_customer ?? undefined,
      valid_from: toDatetimeLocal(promotion?.valid_from),
      valid_until: toDatetimeLocal(promotion?.valid_until),
      restricted_hour_from: promotion?.restricted_hour_from?.slice(0, 5) ?? "",
      restricted_hour_until: promotion?.restricted_hour_until?.slice(0, 5) ?? "",
      branch_ids: [],
      category_ids: [],
      tag_ids: [],
      is_combo: promotion?.is_combo ?? false,
      combo_price: promotion?.combo_price ?? undefined,
    },
  });

  const watchedValues = watch();
  const appliesTo = watchedValues.applies_to;

  // Combo product search query
  const { data: comboSearchResults } = useProducts({
    type: "product",
    search: comboSearch,
    page: 1,
    page_size: 10,
  });

  // Combo calculations
  const comboRegularPrice = useMemo(() => {
    return comboItems.reduce((sum, ci) => sum + ci.unit_price * ci.quantity, 0);
  }, [comboItems]);

  const comboPrice = Number(watchedValues.combo_price) || 0;

  // Determine category type based on applies_to
  const categoryType = useMemo(() => {
    if (appliesTo === "products") return "product";
    if (appliesTo === "services") return "service";
    return undefined; // "all" = no filter
  }, [appliesTo]);

  const { data: categories } = useCategories(categoryType);

  // Clear category/tag selections when applies_to changes
  const [prevAppliesTo, setPrevAppliesTo] = useState(appliesTo);
  useEffect(() => {
    if (appliesTo !== prevAppliesTo) {
      setSelectedCategories(new Set());
      setSelectedTags(new Set());
      setPrevAppliesTo(appliesTo);
    }
  }, [appliesTo, prevAppliesTo]);

  // Flatten categories and tags for the current type
  const allCategories = useMemo(() => {
    return (categories || []).flatMap((c) => [
      { id: c.id, name: c.name, tags: c.tags },
      ...c.children.map((sc) => ({
        id: sc.id,
        name: `${c.name} > ${sc.name}`,
        tags: sc.tags,
      })),
    ]);
  }, [categories]);

  // Handle category toggle with auto-select tags
  const handleCategoryToggle = useCallback((categoryId: string, categoryTags: { id: string }[]) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
        // Remove all tags of this category
        setSelectedTags((prevTags) => {
          const nextTags = new Set(prevTags);
          categoryTags.forEach((t) => nextTags.delete(t.id));
          return nextTags;
        });
      } else {
        next.add(categoryId);
        // Auto-select all tags of this category
        setSelectedTags((prevTags) => {
          const nextTags = new Set(prevTags);
          categoryTags.forEach((t) => nextTags.add(t.id));
          return nextTags;
        });
      }
      return next;
    });
  }, []);

  const handleTagToggle = useCallback((tagId: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);

      // Auto-deselect category if none of its tags remain selected
      setSelectedCategories((prevCats) => {
        const nextCats = new Set(prevCats);
        for (const cat of allCategories) {
          if (!nextCats.has(cat.id)) continue;
          const hasTags = cat.tags.some((t) => next.has(t.id));
          if (!hasTags) nextCats.delete(cat.id);
        }
        return nextCats;
      });

      return next;
    });
  }, [allCategories]);

  const handleBranchToggle = useCallback((branchId: string) => {
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) next.delete(branchId);
      else next.add(branchId);
      return next;
    });
  }, []);

  // Combo item handlers
  const handleAddComboItem = useCallback((product: { id: string; name: string; sku: string; unit_price: number }) => {
    setComboItems((prev) => {
      const existing = prev.find((ci) => ci.product_id === product.id);
      if (existing) {
        return prev.map((ci) =>
          ci.product_id === product.id ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      }
      return [...prev, { product_id: product.id, quantity: 1, name: product.name, sku: product.sku, unit_price: product.unit_price }];
    });
    setComboSearch("");
    setComboDropdownOpen(false);
  }, []);

  const handleRemoveComboItem = useCallback((productId: string) => {
    setComboItems((prev) => prev.filter((ci) => ci.product_id !== productId));
  }, []);

  const handleComboItemQtyChange = useCallback((productId: string, qty: number) => {
    if (qty < 1) return;
    setComboItems((prev) =>
      prev.map((ci) => (ci.product_id === productId ? { ...ci, quantity: qty } : ci))
    );
  }, []);

  // Sync external state (Sets) back into RHF so Zod validation sees real values
  useEffect(() => {
    setValue("branch_ids", Array.from(selectedBranches));
  }, [selectedBranches, setValue]);

  useEffect(() => {
    setValue("category_ids", Array.from(selectedCategories));
  }, [selectedCategories, setValue]);

  useEffect(() => {
    setValue("tag_ids", Array.from(selectedTags));
  }, [selectedTags, setValue]);

  // Sync combo state into RHF
  useEffect(() => {
    setValue("is_combo", isCombo);
  }, [isCombo, setValue]);

  // Step validation
  const canAdvance = useMemo(() => {
    if (currentStep === 0) {
      if (isCombo) {
        return !!(watchedValues.code && watchedValues.name);
      }
      return !!(watchedValues.code && watchedValues.name && watchedValues.discount_value && watchedValues.discount_value > 0);
    }
    if (isCombo) {
      // Combo steps: 0=datos, 1=productos, 2=requisitos+sede, 3=tiempo, 4=confirmacion
      if (currentStep === 1) {
        return comboItems.length > 0 && comboPrice > 0;
      }
      if (currentStep === 2) {
        return selectedBranches.size > 0;
      }
      if (currentStep === 3) {
        if (watchedValues.valid_from && watchedValues.valid_until) {
          if (new Date(watchedValues.valid_until) < new Date(watchedValues.valid_from)) return false;
        }
        if (watchedValues.restricted_hour_from && watchedValues.restricted_hour_until) {
          if (watchedValues.restricted_hour_until < watchedValues.restricted_hour_from) return false;
        }
        return true;
      }
    } else {
      // Normal steps: 0=datos, 1=requisitos+sede, 2=categorias, 3=tiempo, 4=confirmacion
      if (currentStep === 1) {
        return selectedBranches.size > 0;
      }
      if (currentStep === 2) {
        return selectedCategories.size > 0;
      }
      if (currentStep === 3) {
        if (watchedValues.valid_from && watchedValues.valid_until) {
          if (new Date(watchedValues.valid_until) < new Date(watchedValues.valid_from)) return false;
        }
        if (watchedValues.restricted_hour_from && watchedValues.restricted_hour_until) {
          if (watchedValues.restricted_hour_until < watchedValues.restricted_hour_from) return false;
        }
        return true;
      }
    }
    return true;
  }, [currentStep, isCombo, watchedValues.code, watchedValues.name, watchedValues.discount_value, comboItems.length, comboPrice, selectedBranches.size, selectedCategories.size, watchedValues.valid_from, watchedValues.valid_until, watchedValues.restricted_hour_from, watchedValues.restricted_hour_until]);

  const onSubmit = async (data: CreatePromotionSchemaType) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        ...data,
        branch_ids: Array.from(selectedBranches),
        category_ids: Array.from(selectedCategories),
        tag_ids: Array.from(selectedTags),
      };

      if (isCombo) {
        payload.is_combo = true;
        payload.combo_price = comboPrice;
        payload.combo_items = comboItems.map((ci) => ({
          product_id: ci.product_id,
          quantity: ci.quantity,
        }));
        payload.applies_to = "products";
        payload.discount_type = "fixed_amount";
        payload.discount_value = 0;
        // Don't include category_ids or tag_ids for combos
        delete payload.category_ids;
        delete payload.tag_ids;
      }

      const result = isEditing
        ? await updateMutation.mutateAsync({ id: promotion.id, data: payload })
        : await createMutation.mutateAsync(payload);

      if (!result.success) {
        toast.error(typeof result.error === "string" ? result.error : "Error al guardar la promocion");
        return;
      }

      toast.success(
        "message" in result && result.message
          ? (result.message as string)
          : "Guardado exitosamente"
      );
      router.push("/inventario/promociones");
    } catch (err) {
      console.error("[PromotionForm] submit error:", err);
      toast.error("Error inesperado. Intenta de nuevo.");
    }
  };

  const nextStep = () => {
    if (!canAdvance) return;
    setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
  };
  const prevStep = () => setCurrentStep((s) => Math.max(s - 1, 0));
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Step validation messages
  const stepValidationMsg = useMemo(() => {
    if (currentStep === 0 && !canAdvance) {
      if (isCombo) return "Completa el codigo y nombre";
      return "Completa el codigo, nombre y valor del descuento";
    }
    if (isCombo) {
      if (currentStep === 1 && !canAdvance) {
        if (comboItems.length === 0) return "Agrega al menos un producto al combo";
        if (comboPrice <= 0) return "Ingresa el precio del combo";
      }
      if (currentStep === 2 && !canAdvance) return "Selecciona al menos una sede";
      if (currentStep === 3 && !canAdvance) {
        if (watchedValues.valid_from && watchedValues.valid_until && new Date(watchedValues.valid_until) < new Date(watchedValues.valid_from))
          return "\"Valido hasta\" no puede ser anterior a \"Valido desde\"";
        return "\"Hora fin\" no puede ser anterior a \"Hora inicio\"";
      }
    } else {
      if (currentStep === 1 && !canAdvance) return "Selecciona al menos una sede";
      if (currentStep === 2 && !canAdvance) return "Selecciona al menos una categoria";
      if (currentStep === 3 && !canAdvance) {
        if (watchedValues.valid_from && watchedValues.valid_until && new Date(watchedValues.valid_until) < new Date(watchedValues.valid_from))
          return "\"Valido hasta\" no puede ser anterior a \"Valido desde\"";
        return "\"Hora fin\" no puede ser anterior a \"Hora inicio\"";
      }
    }
    return null;
  }, [currentStep, canAdvance, isCombo, comboItems.length, comboPrice]);

  // Determine what step index maps to what content
  // COMBO:  0=datos, 1=productos, 2=requisitos+sede, 3=tiempo, 4=confirmacion
  // NORMAL: 0=datos, 1=requisitos+sede, 2=categorias, 3=tiempo, 4=confirmacion
  const stepRequisitos = isCombo ? 2 : 1;
  const stepCategorias = isCombo ? -1 : 2; // -1 = skipped
  const stepComboProducts = isCombo ? 1 : -1; // -1 = skipped
  const stepTiempo = isCombo ? 3 : 3;
  const stepConfirmacion = isCombo ? 4 : 4;

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <MultiStepForm steps={steps} currentStep={currentStep} onStepChange={setCurrentStep}>
        {/* Step: Datos basicos */}
        {currentStep === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="code">Codigo *</Label>
                <Input id="code" placeholder="PROMO-001" {...register("code")} />
                {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input id="name" placeholder="Nombre de la promocion" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descripcion</Label>
              <Textarea placeholder="Descripcion opcional" rows={2} {...register("description")} />
            </div>

            {/* Combo Toggle */}
            {!isEditing && (
              <div
                className="flex items-center gap-3 rounded-lg border-2 border-border p-4 transition-colors data-[combo=true]:border-primary/40 data-[combo=true]:bg-primary/5"
                data-combo={isCombo}
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Combo</p>
                  <p className="text-xs text-muted-foreground">Agrupa productos especificos a un precio especial</p>
                </div>
                <Switch
                  checked={isCombo}
                  onCheckedChange={(v) => {
                    setIsCombo(v);
                    if (v) {
                      setValue("applies_to", "products");
                      setValue("discount_type", "fixed_amount");
                      setValue("discount_value", 0);
                    }
                    // Reset step to 0 when toggling to prevent out-of-bounds
                    setCurrentStep(0);
                  }}
                />
              </div>
            )}

            {/* Normal promo fields (hidden when combo) */}
            {!isCombo && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tipo de descuento *</Label>
                    <Select
                      value={watchedValues.discount_type}
                      onValueChange={(v) => setValue("discount_type", v as "percentage" | "fixed_amount")}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                        <SelectItem value="fixed_amount">Monto fijo (S/.)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor del descuento *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={watchedValues.discount_type === "percentage" ? "Ej: 50" : "Ej: 10.00"}
                      {...register("discount_value")}
                    />
                    {errors.discount_value && <p className="text-xs text-destructive">{errors.discount_value.message}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Aplica a</Label>
                  <Select
                    value={watchedValues.applies_to}
                    onValueChange={(v) => setValue("applies_to", v as "all" | "products" | "services")}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Productos y servicios</SelectItem>
                      <SelectItem value="products">Solo productos</SelectItem>
                      <SelectItem value="services">Solo servicios</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Combo price field */}
            {isCombo && (
              <div className="space-y-2">
                <Label>Precio del combo (S/.)</Label>
                <Input type="number" step="0.01" min="0.01" {...register("combo_price")} />
                {comboItems.length > 0 && comboPrice > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Precio regular: <span className="line-through">S/. {comboRegularPrice.toFixed(2)}</span>
                    {" "}Ahorro: <span className="text-emerald-400 font-semibold">S/. {(comboRegularPrice - comboPrice).toFixed(2)}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step: Productos del combo (only when isCombo) */}
        {currentStep === stepComboProducts && isCombo && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Package className="size-4 text-primary" />
              <Label className="text-sm font-medium">Productos del combo *</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Busca y agrega productos al combo. Puedes ajustar la cantidad de cada uno.
            </p>

            {/* Product search */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto por nombre o SKU..."
                  value={comboSearch}
                  onChange={(e) => {
                    setComboSearch(e.target.value);
                    setComboDropdownOpen(e.target.value.length > 0);
                  }}
                  onFocus={() => {
                    if (comboSearch.length > 0) setComboDropdownOpen(true);
                  }}
                  className="pl-10"
                />
              </div>

              {/* Search dropdown */}
              {comboDropdownOpen && comboSearch.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg max-h-60 overflow-y-auto">
                  {comboSearchResults?.data && comboSearchResults.data.length > 0 ? (
                    comboSearchResults.data.map((product) => {
                      const alreadyAdded = comboItems.some((ci) => ci.product_id === product.id);
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() =>
                            handleAddComboItem({
                              id: product.id,
                              name: product.name,
                              sku: product.sku,
                              unit_price: product.unit_price,
                            })
                          }
                          disabled={alreadyAdded}
                          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground truncate">{product.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
                          </div>
                          <span className="text-sm font-medium text-foreground shrink-0 ml-3">
                            S/. {product.unit_price.toFixed(2)}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                      No se encontraron productos
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Selected combo items table */}
            {comboItems.length > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Producto</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">SKU</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Precio</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground">Cant.</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Subtotal</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {comboItems.map((ci) => (
                      <tr key={ci.product_id} className="border-b border-border/50 last:border-b-0">
                        <td className="px-3 py-2 font-medium text-foreground truncate max-w-[200px]">{ci.name}</td>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{ci.sku}</td>
                        <td className="px-3 py-2 text-right text-foreground">S/. {ci.unit_price.toFixed(2)}</td>
                        <td className="px-3 py-2 text-center">
                          <Input
                            type="number"
                            min="1"
                            value={ci.quantity}
                            onChange={(e) => handleComboItemQtyChange(ci.product_id, parseInt(e.target.value) || 1)}
                            className="w-16 mx-auto text-center h-8"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">
                          S/. {(ci.unit_price * ci.quantity).toFixed(2)}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveComboItem(ci.product_id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/20">
                      <td colSpan={4} className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Total regular:
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-foreground">
                        S/. {comboRegularPrice.toFixed(2)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8 text-center">
                <Package className="size-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">Aun no has agregado productos al combo</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Usa el buscador de arriba para agregar productos</p>
              </div>
            )}

            {comboItems.length === 0 && (
              <p className="text-xs text-destructive">Agrega al menos un producto al combo</p>
            )}
          </div>
        )}

        {/* Step: Requisitos y sede */}
        {currentStep === stepRequisitos && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Compra minima (S/.)</Label>
                <Input type="number" step="0.01" min="0" placeholder="Sin minimo" {...register("min_purchase_amount")} />
              </div>
              <div className="space-y-2">
                <Label>Descuento maximo (S/.)</Label>
                <Input type="number" step="0.01" min="0" placeholder="Sin maximo" {...register("max_discount_amount")} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Cantidad minima</Label>
                <Input type="number" min="1" placeholder="Ej: 3 unidades" {...register("min_quantity")} />
              </div>
              <div className="space-y-2">
                <Label>Aplica cada</Label>
                <Input type="number" min="0" placeholder="0" {...register("applies_every")} />
                <p className="text-xs text-muted-foreground">
                  0 = No aplica. Ej: 3 = el descuento aplica cada 3 unidades compradas
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Stock total</Label>
                <Input type="number" min="0" placeholder="Ilimitado" {...register("stock")} />
              </div>
              <div className="space-y-2">
                <Label>Max usos por cliente</Label>
                <Input type="number" min="1" placeholder="Ilimitado" {...register("max_uses_per_customer")} />
              </div>
            </div>

            {/* Sedes */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-primary" />
                <Label className="text-sm font-medium">Sedes aplicables *</Label>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {branches?.map((branch) => (
                  <label
                    key={branch.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-200 ${
                      selectedBranches.has(branch.id)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <Checkbox
                      checked={selectedBranches.has(branch.id)}
                      onCheckedChange={() => handleBranchToggle(branch.id)}
                    />
                    <span className="text-sm">{branch.name}</span>
                  </label>
                ))}
              </div>
              {selectedBranches.size === 0 && (
                <p className="text-xs text-destructive">Selecciona al menos una sede</p>
              )}
            </div>
          </div>
        )}

        {/* Step: Categorias y etiquetas (only when NOT combo) */}
        {currentStep === stepCategorias && !isCombo && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FolderOpen className="size-4 text-primary" />
              <Label className="text-sm font-medium">Categorias aplicables *</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {appliesTo === "products"
                ? "Mostrando categorias de productos"
                : appliesTo === "services"
                  ? "Mostrando categorias de servicios"
                  : "Mostrando todas las categorias"}
              . Selecciona al menos una.
            </p>

            {allCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4">
                No hay categorias disponibles para este tipo.
              </p>
            ) : (
              <div className="space-y-3">
                {allCategories.map((cat) => {
                  const isSelected = selectedCategories.has(cat.id);
                  return (
                    <div
                      key={cat.id}
                      className={`rounded-xl border transition-all duration-200 ${
                        isSelected
                          ? "border-primary/60 bg-primary/5"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      {/* Category header */}
                      <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleCategoryToggle(cat.id, cat.tags)}
                        />
                        <FolderOpen className="size-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{cat.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {cat.tags.length} etiqueta{cat.tags.length !== 1 ? "s" : ""}
                        </span>
                      </label>

                      {/* Tags (visible when category is selected and has tags) */}
                      {isSelected && cat.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 border-t border-border/50 px-4 py-3">
                          {cat.tags.map((tag) => {
                            const isTagSelected = selectedTags.has(tag.id);
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                onClick={() => handleTagToggle(tag.id)}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200 ${
                                  isTagSelected
                                    ? "border-primary/60 bg-primary/10 text-primary"
                                    : "border-border text-muted-foreground hover:border-primary/40"
                                }`}
                              >
                                {isTagSelected && <Check className="size-3" />}
                                <Tag className="size-3" />
                                <span style={{ color: isTagSelected ? (tag.color || undefined) : undefined }}>
                                  {tag.name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {selectedCategories.size === 0 && allCategories.length > 0 && (
              <p className="text-xs text-destructive">Selecciona al menos una categoria</p>
            )}
          </div>
        )}

        {/* Step: Tiempo */}
        {currentStep === stepTiempo && (
          <div className="space-y-5">
            <div className="space-y-4">
              <Label className="text-sm font-medium">Vigencia</Label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Valido desde</Label>
                  <Input type="datetime-local" {...register("valid_from")} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Valido hasta</Label>
                  <Input type="datetime-local" {...register("valid_until")} />
                  {watchedValues.valid_from && watchedValues.valid_until && new Date(watchedValues.valid_until) < new Date(watchedValues.valid_from) && (
                    <p className="text-xs text-destructive">No puede ser anterior a &quot;Valido desde&quot;</p>
                  )}
                </div>
              </div>
              {!watchedValues.valid_from && !watchedValues.valid_until && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2">
                  <Info className="size-4 text-blue-400 shrink-0" />
                  <span className="text-xs text-blue-400">Sin fechas = la promocion no expira</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-medium">Restriccion horaria</Label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Hora inicio</Label>
                  <Input type="time" {...register("restricted_hour_from")} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Hora fin</Label>
                  <Input type="time" {...register("restricted_hour_until")} />
                  {watchedValues.restricted_hour_from && watchedValues.restricted_hour_until && watchedValues.restricted_hour_until < watchedValues.restricted_hour_from && (
                    <p className="text-xs text-destructive">No puede ser anterior a &quot;Hora inicio&quot;</p>
                  )}
                </div>
              </div>
              {!watchedValues.restricted_hour_from && !watchedValues.restricted_hour_until && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2">
                  <Info className="size-4 text-blue-400 shrink-0" />
                  <span className="text-xs text-blue-400">Sin horarios = sin restriccion de hora</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step: Confirmacion */}
        {currentStep === stepConfirmacion && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-foreground">Resumen de la promocion</h3>
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <Row label="Codigo" value={watchedValues.code} />
              <Row label="Nombre" value={watchedValues.name} />

              {isCombo ? (
                <>
                  <Row label="Tipo" value="Combo" />
                  {/* Combo products list */}
                  <div className="space-y-1 pt-1">
                    <span className="text-sm text-muted-foreground">Productos:</span>
                    <div className="space-y-1 pl-2">
                      {comboItems.map((ci) => (
                        <div key={ci.product_id} className="flex items-center justify-between text-sm">
                          <span className="text-foreground">{ci.quantity}x {ci.name}</span>
                          <span className="text-muted-foreground font-mono text-xs">S/. {(ci.unit_price * ci.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Row
                    label="Precio regular"
                    value={`S/. ${comboRegularPrice.toFixed(2)}`}
                  />
                  <Row
                    label="Precio combo"
                    value={`S/. ${comboPrice.toFixed(2)}`}
                  />
                  {comboRegularPrice > 0 && comboPrice > 0 && (
                    <div className="flex items-center justify-between text-sm gap-4">
                      <span className="text-muted-foreground shrink-0">Ahorro</span>
                      <span className="font-semibold text-emerald-400 text-right">
                        S/. {(comboRegularPrice - comboPrice).toFixed(2)} ({comboRegularPrice > 0 ? ((1 - comboPrice / comboRegularPrice) * 100).toFixed(0) : 0}%)
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Row
                    label="Tipo"
                    value={watchedValues.discount_type === "percentage" ? "Porcentaje" : "Monto fijo"}
                  />
                  <Row
                    label="Valor"
                    value={
                      watchedValues.discount_type === "percentage"
                        ? `${watchedValues.discount_value}%`
                        : `S/. ${watchedValues.discount_value}`
                    }
                  />
                  <Row
                    label="Aplica a"
                    value={
                      appliesTo === "all"
                        ? "Productos y servicios"
                        : appliesTo === "products"
                          ? "Solo productos"
                          : "Solo servicios"
                    }
                  />
                  {(watchedValues.applies_every ?? 0) > 0 && (
                    <Row label="Aplica cada" value={`Cada ${watchedValues.applies_every} unidades`} />
                  )}
                  <Row
                    label="Categorias"
                    value={`${selectedCategories.size} seleccionada${selectedCategories.size !== 1 ? "s" : ""}`}
                  />
                  <Row
                    label="Etiquetas"
                    value={
                      selectedTags.size > 0
                        ? `${selectedTags.size} seleccionada${selectedTags.size !== 1 ? "s" : ""}`
                        : "Todas las de las categorias seleccionadas"
                    }
                  />
                </>
              )}

              <Row
                label="Sedes"
                value={
                  branches
                    ?.filter((b) => selectedBranches.has(b.id))
                    .map((b) => b.name)
                    .join(", ") || "-"
                }
              />
              <Row
                label="Vigencia"
                value={
                  watchedValues.valid_from || watchedValues.valid_until
                    ? `${watchedValues.valid_from || "..."} — ${watchedValues.valid_until || "..."}`
                    : "Sin vencimiento"
                }
              />
              <Row
                label="Horario"
                value={
                  watchedValues.restricted_hour_from || watchedValues.restricted_hour_until
                    ? `${watchedValues.restricted_hour_from || "..."} — ${watchedValues.restricted_hour_until || "..."}`
                    : "Sin restriccion"
                }
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <Info className="size-4 text-amber-400 shrink-0" />
              <span className="text-xs text-amber-400">
                {isEditing
                  ? "Los cambios se aplicaran inmediatamente."
                  : "La promocion se activara inmediatamente."}
              </span>
            </div>
          </div>
        )}
      </MultiStepForm>

      <div className="mt-6 flex items-center justify-between">
        <Button type="button" variant="outline" onClick={prevStep} disabled={currentStep === 0}>
          Anterior
        </Button>
        <div className="flex items-center gap-3">
          {stepValidationMsg && (
            <p className="text-xs text-muted-foreground hidden sm:block">{stepValidationMsg}</p>
          )}
          {currentStep < steps.length - 1 ? (
            <Button type="button" onClick={nextStep} disabled={!canAdvance}>
              Siguiente
            </Button>
          ) : (
            <Button type="button" disabled={isPending} onClick={() => handleSubmit(onSubmit)()}>
              {isPending
                ? "Enviando..."
                : "Guardar"}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex items-center justify-between text-sm gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-foreground text-right truncate">{value || "-"}</span>
    </div>
  );
}
