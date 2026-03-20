"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { MultiStepForm } from "@/components/ui/multi-step-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Package, DollarSign, BarChart3, Tag } from "lucide-react";
import { FileUpload } from "@/components/ui/file-upload";
import { CategoryMultiSelect } from "@/components/inventario/category-multi-select";
import { createSupplySchema, type CreateSupplySchemaType } from "@/lib/validators/supply";
import { CURRENCY_OPTIONS, UOM_OPTIONS, DECIMAL_UNITS } from "@/lib/constants/sunat";
import { useCategories } from "@/hooks/queries/use-categories";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { useCreateSupply, useUpdateSupply } from "@/hooks/queries/use-supplies";
import type { SupplyDetail } from "@/types/supply";

interface SupplyFormProps {
  supply?: SupplyDetail | null;
}

const STEPS = [
  { title: "Datos basicos" },
  { title: "Precio y Stock" },
  { title: "Etiquetas" },
  { title: "Confirmacion" },
];

export function SupplyForm({ supply }: SupplyFormProps) {
  const isEditing = !!supply;
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [shakeStep, setShakeStep] = useState(0);

  const createMutation = useCreateSupply();
  const updateMutation = useUpdateSupply();
  const { data: categories } = useCategories("supply");
  const { data: branches } = useBranchesForSelect();

  // File upload state
  const [supplyImage, setSupplyImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(supply?.image_url ?? null);
  const [uploading, setUploading] = useState(false);

  // Category multi-select state
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(supply?.categories?.map((c) => c.id) ?? [])
  );

  const allTags = (categories || []).flatMap((c) => [
    ...c.tags.map((t) => ({ ...t, category_name: c.name, category_id: c.id })),
    ...c.children.flatMap((sc) =>
      sc.tags.map((t) => ({ ...t, category_name: `${c.name} > ${sc.name}`, category_id: sc.id }))
    ),
  ]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    getValues,
    setError,
    formState: { errors },
  } = useForm<CreateSupplySchemaType>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createSupplySchema) as any,
    defaultValues: {
      name: supply?.name ?? "",
      description: supply?.description ?? "",
      category_ids: supply?.categories?.map((c) => c.id) ?? [],
      image_url: supply?.image_url ?? "",
      cost_price: supply?.cost_price ?? 0,
      currency: supply?.currency ?? "PEN",
      stock_quantity: supply?.stock_quantity ?? 0,
      min_stock: supply?.min_stock ?? 0,
      unit_of_measure: supply?.unit_of_measure ?? "NIU",
      branch_id: supply?.branch_id ?? "",
      barcode: supply?.barcode ?? "",
      available_in_pos: supply?.available_in_pos ?? false,
      tag_ids: supply?.tags.map((t) => t.id) ?? [],
    },
  });

  const watchedValues = watch();
  const [selectedTags, setSelectedTags] = useState<Set<string>>(
    new Set(supply?.tags.map((t) => t.id) ?? [])
  );

  const toggleTag = useCallback(
    (tagId: string) => {
      setSelectedTags((prev) => {
        const next = new Set(prev);
        if (next.has(tagId)) next.delete(tagId);
        else next.add(tagId);
        setValue("tag_ids", Array.from(next));
        return next;
      });
    },
    [setValue]
  );

  // Step validation fields
  const getStepFields = (step: number): (keyof CreateSupplySchemaType)[] => {
    switch (step) {
      case 0: return ["name", "branch_id"];
      default: return [];
    }
  };

  const triggerShake = () => {
    setShakeStep((s) => s + 1);
  };

  const validateInvoiceFields = (): boolean => {
    const stockVal = Number(getValues("stock_quantity") || 0);
    if (stockVal <= 0) return true;
    // No invoice validation required for supplies on create (no supplier_ruc/invoice_code in schema as required)
    return true;
  };

  const nextStep = async () => {
    const fields = getStepFields(currentStep);
    if (fields.length > 0) {
      const valid = await trigger(fields);
      if (!valid) {
        triggerShake();
        toast.error("Completa los campos requeridos");
        return;
      }
    }
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleStepChange = async (target: number) => {
    if (target <= currentStep) {
      setCurrentStep(target);
      return;
    }
    for (let s = currentStep; s < target; s++) {
      const fields = getStepFields(s);
      if (fields.length > 0) {
        const valid = await trigger(fields);
        if (!valid) {
          setCurrentStep(s);
          triggerShake();
          toast.error("Completa los campos requeridos");
          return;
        }
      }
    }
    setCurrentStep(target);
  };

  const prevStep = () => setCurrentStep((s) => Math.max(s - 1, 0));

  const onSubmit = async (data: CreateSupplySchemaType) => {
    setUploading(true);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      // Get tenant_id
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user!.id)
        .single();
      const tenantId = profile!.tenant_id;

      // Upload supply image if provided
      let imageUrl = data.image_url;
      if (supplyImage) {
        const imgPath = `${tenantId}/${Date.now()}-${supplyImage.name}`;
        const { error } = await supabase.storage
          .from("supply-images")
          .upload(imgPath, supplyImage);
        if (error) {
          toast.error("Error al subir imagen");
          return;
        }
        const { data: urlData } = supabase.storage
          .from("supply-images")
          .getPublicUrl(imgPath);
        imageUrl = urlData.publicUrl;
      }

      const submitData = {
        ...data,
        image_url: imageUrl || undefined,
      };

      const result = isEditing
        ? await updateMutation.mutateAsync({ id: supply.id, data: submitData })
        : await createMutation.mutateAsync(submitData);

      if (!result.success) {
        toast.error(typeof result.error === "string" ? result.error : "Error al guardar");
        return;
      }

      toast.success(isEditing ? "Actualizado exitosamente" : "Creado exitosamente");
      router.push("/inventario/insumos");
    } finally {
      setUploading(false);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || uploading;

  const flatCategories = (categories || []).flatMap((c) => [
    { id: c.id, name: c.name, level: 0 },
    ...c.children.map((sc) => ({ id: sc.id, name: `${c.name} > ${sc.name}`, level: 1 })),
  ]);

  // Filter tags to only show tags from selected categories
  const filteredTags = allTags.filter((tag) => {
    const tagCategory = (categories || [])
      .flatMap((c) => [c, ...c.children])
      .find((cat) => cat.tags.some((t) => t.id === tag.id));
    return tagCategory ? selectedCategories.has(tagCategory.id) : false;
  });

  const getStepContent = (step: number) => {
    if (step === 3) return renderConfirmationStep();
    if (step === 2) return renderTagsStep();

    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            {/* Photo upload (optional) */}
            <div className="space-y-2">
              <FileUpload
                label="Foto del insumo"
                description="Imagen principal (JPG, PNG, WebP) -- opcional"
                accept="image/*"
                maxSizeMB={5}
                value={supplyImage}
                preview={imagePreview}
                onChange={(f) => {
                  setSupplyImage(f);
                  if (f) {
                    const url = URL.createObjectURL(f);
                    setImagePreview(url);
                    setValue("image_url", "pending-upload");
                  } else {
                    setImagePreview(null);
                    setValue("image_url", "");
                  }
                }}
              />
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                placeholder="Nombre del insumo"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Descripcion</Label>
              <Textarea
                id="description"
                placeholder="Descripcion opcional"
                rows={3}
                {...register("description")}
              />
            </div>

            {/* Categories - multi-select */}
            <div className="space-y-2">
              <Label>Categorias</Label>
              <CategoryMultiSelect
                categories={flatCategories}
                selected={Array.from(selectedCategories)}
                onChange={(ids) => {
                  setSelectedCategories(new Set(ids));
                  setValue("category_ids", ids);
                }}
              />
            </div>

            {/* Sede selector */}
            <div className="space-y-2">
              <Label>Sede *</Label>
              <Select
                value={watchedValues.branch_id || ""}
                onValueChange={(v) => setValue("branch_id", v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar sede" />
                </SelectTrigger>
                <SelectContent>
                  {branches?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.branch_id && (
                <p className="text-xs text-destructive">{errors.branch_id.message}</p>
              )}
            </div>

            {/* Available in POS toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-4">
              <div>
                <Label className="text-sm font-medium">Disponible en POS</Label>
                <p className="text-xs text-muted-foreground">
                  Permite vender este insumo directamente desde POI Fact
                </p>
              </div>
              <Switch
                checked={watchedValues.available_in_pos}
                onCheckedChange={(checked) => setValue("available_in_pos", checked)}
              />
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cost_price">Costo unitario</Label>
                <Input id="cost_price" type="number" step="0.01" min="0" {...register("cost_price")} />
                {errors.cost_price && <p className="text-xs text-destructive">{errors.cost_price.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={watchedValues.currency} onValueChange={(v) => setValue("currency", v as "PEN" | "USD")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Unidad de medida</Label>
              <Select value={watchedValues.unit_of_measure} onValueChange={(v) => setValue("unit_of_measure", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UOM_OPTIONS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="stock_quantity">Stock inicial</Label>
                {isEditing ? (
                  <>
                    <Input value={String(supply?.stock_quantity ?? 0)} disabled className="opacity-70" />
                    <p className="text-xs text-muted-foreground">El stock se gestiona desde el detalle del insumo</p>
                  </>
                ) : (
                  <Input id="stock_quantity" type="number" min="0" step={DECIMAL_UNITS.has(watchedValues.unit_of_measure) ? "any" : "1"} {...register("stock_quantity")} />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="min_stock">Stock minimo</Label>
                <Input id="min_stock" type="number" min="0" step={DECIMAL_UNITS.has(watchedValues.unit_of_measure) ? "any" : "1"} {...register("min_stock")} />
              </div>
            </div>

            {/* Invoice + supplier RUC block when stock > 0 (only on create) */}
            {Number(watchedValues.stock_quantity) > 0 && !isEditing && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300 rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Datos de factura de compra (opcional)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="supplier_ruc">RUC del proveedor</Label>
                    <Input
                      id="supplier_ruc"
                      placeholder="20123456789"
                      maxLength={11}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoice_code">Codigo de factura</Label>
                    <Input
                      id="invoice_code"
                      placeholder="F001-00001234"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const renderTagsStep = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Selecciona las etiquetas que aplican a este insumo.
      </p>
      {selectedCategories.size === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Selecciona al menos una categoria para ver las etiquetas disponibles.
        </p>
      ) : filteredTags.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No hay etiquetas creadas en las categorias seleccionadas. Puedes crearlas desde la barra lateral de categorias.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {filteredTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: selectedTags.has(tag.id) ? (tag.color ? `${tag.color}20` : "var(--primary-10)") : undefined,
                color: selectedTags.has(tag.id) ? (tag.color || "var(--primary)") : undefined,
                borderColor: selectedTags.has(tag.id) ? (tag.color || "var(--primary)") : "var(--border)",
              }}
            >
              {tag.name}
              <span className="text-[10px] text-muted-foreground">{tag.category_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderConfirmationStep = () => {
    const currency = watchedValues.currency === "PEN" ? "S/." : "$";
    const selectedCatNames = flatCategories
      .filter((c) => selectedCategories.has(c.id))
      .map((c) => c.name);
    const selectedTagNames = allTags
      .filter((t) => selectedTags.has(t.id))
      .map((t) => t.name);
    const uomLabel = UOM_OPTIONS.find((u) => u.value === watchedValues.unit_of_measure)?.label || watchedValues.unit_of_measure;

    type SummaryRow = { label: string; value: string };
    type ImageRow = { type: "image"; src: string };
    type SectionRow = SummaryRow | ImageRow;

    const sections: { title: string; icon: React.ReactNode; rows: SectionRow[] }[] = [
      {
        title: "Datos basicos",
        icon: <Package className="size-4" />,
        rows: [
          ...(imagePreview ? [{ type: "image" as const, src: imagePreview }] : []),
          { label: "Nombre", value: watchedValues.name },
          ...(watchedValues.description ? [{ label: "Descripcion", value: watchedValues.description }] : []),
          { label: "Categorias", value: selectedCatNames.length > 0 ? selectedCatNames.join(", ") : "Ninguna" },
          { label: "Sede", value: branches?.find((b) => b.id === watchedValues.branch_id)?.name || "\u2014" },
          { label: "Disponible en POS", value: watchedValues.available_in_pos ? "Si" : "No" },
        ],
      },
      {
        title: "Precio y stock",
        icon: <DollarSign className="size-4" />,
        rows: [
          { label: "Costo", value: Number(watchedValues.cost_price ?? 0) > 0 ? `${currency} ${Number(watchedValues.cost_price).toFixed(2)}` : "\u2014" },
          { label: "Moneda", value: watchedValues.currency === "PEN" ? "Soles (PEN)" : "Dolares (USD)" },
          { label: "Unidad de medida", value: uomLabel },
          { label: "Stock inicial", value: String(watchedValues.stock_quantity ?? 0) },
          { label: "Stock minimo", value: String(watchedValues.min_stock ?? 0) },
        ] as SummaryRow[],
      },
      {
        title: "Etiquetas",
        icon: <Tag className="size-4" />,
        rows: [
          { label: "Seleccionadas", value: selectedTagNames.length > 0 ? selectedTagNames.join(", ") : "Ninguna" },
        ],
      },
    ];

    return (
      <>
        <style>{`
          @keyframes confirm-section-in {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .confirm-section {
            animation: confirm-section-in 0.3s ease-out both;
          }
        `}</style>
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground">Resumen</h3>
          {sections.map((section, sIdx) => (
            <div
              key={section.title}
              className="confirm-section rounded-lg border border-border/60 bg-card/50 p-4 space-y-3"
              style={{ animationDelay: `${sIdx * 100}ms` }}
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.icon}
                {section.title}
              </div>
              <div className="space-y-2">
                {section.rows.map((row, rIdx) =>
                  "type" in row && row.type === "image" ? (
                    <div key={rIdx} className="flex items-center gap-3 pb-1">
                      <div className="size-14 shrink-0 overflow-hidden rounded-lg border border-border">
                        <img src={row.src} alt="Preview" className="h-full w-full object-cover" />
                      </div>
                      <span className="text-sm text-muted-foreground">
                        Foto del insumo
                      </span>
                    </div>
                  ) : (
                    <div key={rIdx} className="flex items-start justify-between gap-4 text-sm">
                      <span className="shrink-0 text-muted-foreground">{(row as SummaryRow).label}</span>
                      <span className="max-w-[60%] text-right font-medium text-foreground">{(row as SummaryRow).value}</span>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <MultiStepForm
        steps={STEPS}
        currentStep={currentStep}
        onStepChange={handleStepChange}
      >
        <div
          key={shakeStep}
          className={shakeStep > 0 ? "animate-[shake_0.4s_ease-in-out]" : ""}
        >
          {getStepContent(currentStep)}
        </div>
      </MultiStepForm>

      <div className="mt-6 flex justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={prevStep}
          disabled={currentStep === 0}
        >
          Anterior
        </Button>

        {currentStep < STEPS.length - 1 ? (
          <Button type="button" onClick={nextStep}>
            Siguiente
          </Button>
        ) : (
          <Button type="button" disabled={isPending} onClick={handleSubmit(onSubmit)}>
            {isPending ? "Guardando..." : isEditing ? "Actualizar" : "Crear"}
          </Button>
        )}
      </div>
    </form>
  );
}
