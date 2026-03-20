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
import { Check, X, Package, Briefcase, DollarSign, BarChart3, Tag, ChefHat, Trash2, Search } from "lucide-react";
import { FileUpload } from "@/components/ui/file-upload";
import { CategoryMultiSelect } from "@/components/inventario/category-multi-select";
import { createProductSchema, type CreateProductSchemaType } from "@/lib/validators/product";
import { validateEAN, detectBarcodeFormat } from "@/lib/utils/barcode";
import { TAX_TYPE_OPTIONS, CURRENCY_OPTIONS, UOM_OPTIONS, DECIMAL_UNITS } from "@/lib/constants/sunat";
import { useCategories } from "@/hooks/queries/use-categories";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { useCreateProduct, useUpdateProduct } from "@/hooks/queries/use-products";
import { useSupplies } from "@/hooks/queries/use-supplies";
import type { ProductDetail, ProductType, RecipeItem } from "@/types/product";

interface ProductFormProps {
  product?: ProductDetail | null;
  type: ProductType;
}

const PRODUCT_STEPS = [
  { title: "Tipo de producto" },
  { title: "Datos basicos" },
  { title: "Precios e Impuestos" },
  { title: "Stock y Codigo" },
  { title: "Etiquetas" },
  { title: "Confirmacion" },
];

const COMPOSITE_STEPS = [
  { title: "Tipo de producto" },
  { title: "Datos basicos" },
  { title: "Precios e Impuestos" },
  { title: "Receta" },
  { title: "Stock" },
  { title: "Etiquetas" },
  { title: "Confirmacion" },
];

const SERVICE_STEPS = [
  { title: "Datos basicos" },
  { title: "Precios e Impuestos" },
  { title: "Etiquetas" },
  { title: "Confirmacion" },
];

export function ProductForm({ product, type }: ProductFormProps) {
  const isEditing = !!product;
  const isService = type === "service";
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [shakeStep, setShakeStep] = useState(0);

  // Composite product state
  const [productKind, setProductKind] = useState<"simple" | "composite">(
    product?.product_kind ?? "simple"
  );
  const [recipeItems, setRecipeItems] = useState<Array<{
    supply_id: string;
    supply_name: string;
    unit_of_measure: string;
    stock_quantity: number;
    quantity_needed: number;
  }>>(
    product?.recipe_items?.map((ri) => ({
      supply_id: ri.supply_id,
      supply_name: ri.supply_name || "",
      unit_of_measure: ri.unit_of_measure,
      stock_quantity: ri.supply_stock ?? 0,
      quantity_needed: ri.quantity_needed,
    })) ?? []
  );
  const [supplySearch, setSupplySearch] = useState("");

  const steps = isService ? SERVICE_STEPS : (productKind === "composite" ? COMPOSITE_STEPS : PRODUCT_STEPS);

  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const { data: categories } = useCategories(type);
  const { data: branches } = useBranchesForSelect();

  // Supply search query (only when composite)
  const { data: suppliesData } = useSupplies({
    search: supplySearch || undefined,
    is_active: true,
    page: 1,
    page_size: 20,
  });

  // File upload state
  const [productImage, setProductImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(product?.image_url ?? null);
  const [uploading, setUploading] = useState(false);

  // Barcode mode: "auto" = generate on server, "manual" = user inputs code
  const [barcodeMode, setBarcodeMode] = useState<"auto" | "manual">(
    product?.barcode ? "manual" : "auto"
  );

  // Category multi-select state
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(product?.categories?.map((c) => c.id) ?? [])
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
  } = useForm<CreateProductSchemaType>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createProductSchema) as any,
    defaultValues: {
      name: product?.name ?? "",
      description: product?.description ?? "",
      type,
      product_kind: product?.product_kind ?? "simple",
      category_ids: product?.categories?.map((c) => c.id) ?? [],
      image_url: product?.image_url ?? "",
      unit_price: product?.unit_price ?? 0,
      cost_price: product?.cost_price ?? 0,
      currency: product?.currency ?? "PEN",
      tax_type: product?.tax_type ?? "gravado",
      igv_rate: product?.igv_rate ?? 18,
      stock_quantity: product?.stock_quantity ?? 0,
      min_stock: product?.min_stock ?? 0,
      unit_of_measure: isService ? "ZZ" : (product?.unit_of_measure ?? "NIU"),
      invoice_code: "",
      supplier_ruc: "",
      barcode: product?.barcode ?? "",
      barcode_format: ((product as unknown as Record<string, unknown>)?.barcode_format as "EAN-13" | "EAN-8") ?? "EAN-13",
      branch_id: product?.branch_id ?? "",
      tag_ids: product?.tags.map((t) => t.id) ?? [],
      is_schedulable: product?.is_schedulable ?? false,
    },
  });

  const watchedValues = watch();
  const [selectedTags, setSelectedTags] = useState<Set<string>>(
    new Set(product?.tags.map((t) => t.id) ?? [])
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
  const getStepFields = (step: number): (keyof CreateProductSchemaType)[] => {
    if (isService) {
      switch (step) {
        case 0: return ["name", "branch_id"];
        case 1: return ["unit_price"];
        default: return [];
      }
    }
    // Products (simple & composite): step 0 = Tipo, step 1 = Datos, step 2 = Precios
    switch (step) {
      case 0: return []; // Kind selector - no form validation needed
      case 1: return ["name", "branch_id"];
      case 2: return ["unit_price"];
      default: return [];
    }
  };

  const triggerShake = () => {
    setShakeStep((s) => s + 1);
  };

  const validateInvoiceFields = (): boolean => {
    const stockVal = Number(getValues("stock_quantity") || 0);
    if (stockVal <= 0) return true;
    let hasErrors = false;
    const invoiceCode = getValues("invoice_code");
    const supplierRuc = getValues("supplier_ruc");
    if (!invoiceCode) {
      setError("invoice_code", { type: "manual", message: "Codigo de factura requerido" });
      hasErrors = true;
    } else if (!/^[A-Za-z0-9]{4}-\d{8}$/.test(invoiceCode)) {
      setError("invoice_code", { type: "manual", message: "Formato: serie (4 chars) + guion + 8 digitos (ej: F001-00001234)" });
      hasErrors = true;
    }
    if (!supplierRuc || !/^\d{11}$/.test(supplierRuc)) {
      setError("supplier_ruc", { type: "manual", message: "RUC debe tener 11 digitos" });
      hasErrors = true;
    }
    return !hasErrors;
  };

  // Stock step index differs: simple=3, composite=4
  const stockStepIndex = isService ? -1 : (productKind === "composite" ? 4 : 3);
  // Recipe step index: only composite, step 3
  const recipeStepIndex = productKind === "composite" ? 3 : -1;

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
    // Conditional validation for invoice fields on stock step (products only)
    if (currentStep === stockStepIndex && !isService && !isEditing) {
      if (!validateInvoiceFields()) {
        triggerShake();
        toast.error("Completa los datos de factura");
        return;
      }
    }
    // Recipe step validation for composite products
    if (currentStep === recipeStepIndex && productKind === "composite") {
      if (recipeItems.length === 0) {
        triggerShake();
        toast.error("Agrega al menos un insumo a la receta");
        return;
      }
    }
    setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
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
      // Conditional invoice validation on stock step (products only)
      if (s === stockStepIndex && !isService && !isEditing) {
        if (!validateInvoiceFields()) {
          setCurrentStep(s);
          triggerShake();
          toast.error("Completa los datos de factura");
          return;
        }
      }
      // Recipe step validation for composite products
      if (s === recipeStepIndex && productKind === "composite") {
        if (recipeItems.length === 0) {
          setCurrentStep(s);
          triggerShake();
          toast.error("Agrega al menos un insumo a la receta");
          return;
        }
      }
    }
    setCurrentStep(target);
  };

  const prevStep = () => setCurrentStep((s) => Math.max(s - 1, 0));

  const onSubmit = async (data: CreateProductSchemaType) => {
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

      // Upload product image if provided
      let imageUrl = data.image_url;
      if (productImage) {
        const imgPath = `${tenantId}/${Date.now()}-${productImage.name}`;
        const { error } = await supabase.storage
          .from("product-images")
          .upload(imgPath, productImage);
        if (error) {
          toast.error("Error al subir imagen");
          return;
        }
        const { data: urlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(imgPath);
        imageUrl = urlData.publicUrl;
      }

      const submitData = {
        ...data,
        image_url: imageUrl || undefined,
        invoice_code: data.invoice_code || undefined,
        supplier_ruc: data.supplier_ruc || undefined,
        product_kind: productKind,
        recipe_items: productKind === "composite" ? recipeItems.map((ri) => ({
          supply_id: ri.supply_id,
          quantity_needed: ri.quantity_needed,
          unit_of_measure: ri.unit_of_measure,
        })) : undefined,
      };

      const result = isEditing
        ? await updateMutation.mutateAsync({ id: product.id, data: submitData })
        : await createMutation.mutateAsync(submitData);

      if (!result.success) {
        toast.error(typeof result.error === "string" ? result.error : "Error al guardar");
        return;
      }

      toast.success(isEditing ? "Actualizado exitosamente" : "Creado exitosamente");
      router.push(isService ? "/inventario/servicios" : "/inventario/productos");
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
    // --- Service steps (unchanged: 0=Datos, 1=Precios, 2=Tags, 3=Confirm) ---
    if (isService) {
      switch (step) {
        case 0: return renderDatosStep();
        case 1: return renderPreciosStep();
        case 2: return renderTagsStep();
        case 3: return renderConfirmationStep();
        default: return null;
      }
    }

    // --- Product steps ---
    // Simple: 0=Tipo, 1=Datos, 2=Precios, 3=Stock, 4=Tags, 5=Confirm
    // Composite: 0=Tipo, 1=Datos, 2=Precios, 3=Receta, 4=Stock(ro), 5=Tags, 6=Confirm
    if (productKind === "composite") {
      switch (step) {
        case 0: return renderKindStep();
        case 1: return renderDatosStep();
        case 2: return renderPreciosStep();
        case 3: return renderRecipeStep();
        case 4: return renderStockStep();
        case 5: return renderTagsStep();
        case 6: return renderConfirmationStep();
        default: return null;
      }
    }

    // Simple product
    switch (step) {
      case 0: return renderKindStep();
      case 1: return renderDatosStep();
      case 2: return renderPreciosStep();
      case 3: return renderStockStep();
      case 4: return renderTagsStep();
      case 5: return renderConfirmationStep();
      default: return null;
    }
  };

  const renderKindStep = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Selecciona el tipo de producto que deseas crear.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => {
            if (!isEditing) {
              setProductKind("simple");
              setValue("product_kind", "simple");
            }
          }}
          disabled={isEditing}
          className={`relative flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all ${
            productKind === "simple"
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-border hover:border-primary/40 hover:bg-secondary/30"
          } ${isEditing ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <Package className="size-10 text-primary" />
          <div>
            <p className="font-semibold text-foreground">Producto Simple</p>
            <p className="mt-1 text-xs text-muted-foreground">Stock gestionado manualmente</p>
          </div>
          {productKind === "simple" && (
            <div className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary">
              <Check className="size-3 text-primary-foreground" />
            </div>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!isEditing) {
              setProductKind("composite");
              setValue("product_kind", "composite");
            }
          }}
          disabled={isEditing}
          className={`relative flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all ${
            productKind === "composite"
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-border hover:border-primary/40 hover:bg-secondary/30"
          } ${isEditing ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <ChefHat className="size-10 text-primary" />
          <div>
            <p className="font-semibold text-foreground">Producto Compuesto</p>
            <p className="mt-1 text-xs text-muted-foreground">Stock calculado desde receta de insumos</p>
          </div>
          {productKind === "composite" && (
            <div className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary">
              <Check className="size-3 text-primary-foreground" />
            </div>
          )}
        </button>
      </div>
      {isEditing && (
        <p className="text-xs text-muted-foreground italic">
          El tipo de producto no se puede cambiar despues de la creacion.
        </p>
      )}
    </div>
  );

  const renderDatosStep = () => (
    <div className="space-y-4">
      {/* Photo upload (optional) */}
      <div className="space-y-2">
        <FileUpload
          label={`Foto del ${isService ? "servicio" : "producto"}`}
          description="Imagen principal (JPG, PNG, WebP) — opcional"
          accept="image/*"
          maxSizeMB={5}
          value={productImage}
          preview={imagePreview}
          onChange={(f) => {
            setProductImage(f);
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
          placeholder={isService ? "Nombre del servicio" : "Nombre del producto"}
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

      {/* Schedulable toggle — only for services */}
      {isService && (
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="is_schedulable" className="text-sm font-medium">
              Requiere reserva
            </Label>
            <p className="text-xs text-muted-foreground">
              Activar para asignar horarios de atención y gestionar reservas
            </p>
          </div>
          <Switch
            id="is_schedulable"
            checked={!!watchedValues.is_schedulable}
            onCheckedChange={(v) => setValue("is_schedulable", v)}
          />
        </div>
      )}
    </div>
  );

  const renderPreciosStep = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="unit_price">Precio unitario *</Label>
          <Input id="unit_price" type="number" step="0.01" min="0" {...register("unit_price")} />
          {errors.unit_price && <p className="text-xs text-destructive">{errors.unit_price.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="cost_price">Costo</Label>
          <Input id="cost_price" type="number" step="0.01" min="0" {...register("cost_price")} />
          {isService && (
            <p className="text-xs text-muted-foreground">
              Costo asociado al servicio (mano de obra, materiales, etc.)
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
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
        <div className="space-y-2">
          <Label>Tipo de impuesto</Label>
          <Select value={watchedValues.tax_type} onValueChange={(v) => setValue("tax_type", v as "gravado" | "exonerado" | "inafecto")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TAX_TYPE_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {watchedValues.tax_type === "gravado" && (
        <div className="space-y-2">
          <Label htmlFor="igv_rate">Tasa IGV (%)</Label>
          <Input id="igv_rate" type="number" step="0.01" {...register("igv_rate")} />
        </div>
      )}
    </div>
  );

  const renderRecipeStep = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Agrega los insumos necesarios para producir una unidad de este producto.
      </p>

      {/* Supply search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Buscar insumo por nombre..."
          value={supplySearch}
          onChange={(e) => setSupplySearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Supply results */}
      {supplySearch && suppliesData?.data && suppliesData.data.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-card divide-y divide-border">
          {suppliesData.data
            .filter((s) => !recipeItems.some((ri) => ri.supply_id === s.id))
            .map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setRecipeItems((prev) => [...prev, {
                    supply_id: s.id,
                    supply_name: s.name,
                    unit_of_measure: s.unit_of_measure,
                    stock_quantity: s.stock_quantity,
                    quantity_needed: 1,
                  }]);
                  setSupplySearch("");
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-secondary/50 transition-colors"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.sku} · Stock: {s.stock_quantity}</span>
              </button>
            ))}
        </div>
      )}

      {/* Recipe table */}
      {recipeItems.length > 0 ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Insumo</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">UdM</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">Cantidad</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">Stock</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recipeItems.map((item, idx) => (
                <tr key={item.supply_id}>
                  <td className="px-3 py-2 font-medium">{item.supply_name}</td>
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">{item.unit_of_measure}</td>
                  <td className="px-3 py-2 text-center">
                    <Input
                      type="number"
                      min="0.0001"
                      step="0.01"
                      value={item.quantity_needed}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setRecipeItems((prev) => prev.map((ri, i) => i === idx ? { ...ri, quantity_needed: val } : ri));
                      }}
                      className="h-8 w-20 text-center mx-auto"
                    />
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">{item.stock_quantity}</td>
                  <td className="px-3 py-2 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setRecipeItems((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <ChefHat className="mx-auto size-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            Busca y agrega insumos para crear la receta
          </p>
        </div>
      )}

      {/* Calculated stock info */}
      {recipeItems.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">Stock calculado</p>
          <p className="text-lg font-semibold text-foreground">
            {Math.min(...recipeItems.map((ri) => ri.stock_quantity > 0 && ri.quantity_needed > 0 ? Math.floor(ri.stock_quantity / ri.quantity_needed) : 0))} unidades
          </p>
          <p className="text-xs text-muted-foreground">
            Limitado por: {recipeItems.reduce((min, ri) => {
              const possible = ri.quantity_needed > 0 ? Math.floor(ri.stock_quantity / ri.quantity_needed) : 0;
              return possible < (min.possible ?? Infinity) ? { name: ri.supply_name, possible } : min;
            }, { name: "", possible: Infinity } as { name: string; possible: number }).name}
          </p>
        </div>
      )}
    </div>
  );

  const renderStockStep = () => {
    const barcodeValue = watchedValues.barcode || "";
    const barcodeValid = barcodeValue.length > 0 ? validateEAN(barcodeValue) : null;
    const detectedFormat = barcodeValue.length > 0 ? detectBarcodeFormat(barcodeValue) : null;
    const isComposite = productKind === "composite";

    return (
      <div className="space-y-4">
        {isComposite && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <p className="text-sm font-medium text-foreground">Stock calculado automaticamente</p>
            <p className="text-xs text-muted-foreground">
              El stock de un producto compuesto se calcula en base a la disponibilidad de sus insumos.
              No es necesario ingresarlo manualmente.
            </p>
            {recipeItems.length > 0 && (
              <p className="text-lg font-semibold text-primary">
                {Math.min(...recipeItems.map((ri) => ri.stock_quantity > 0 && ri.quantity_needed > 0 ? Math.floor(ri.stock_quantity / ri.quantity_needed) : 0))} unidades disponibles
              </p>
            )}
          </div>
        )}

        {!isComposite && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stock_quantity">Stock actual</Label>
              {isEditing ? (
                <>
                  <Input value={String(product?.stock_quantity ?? 0)} disabled className="opacity-70" />
                  <p className="text-xs text-muted-foreground">El stock se gestiona desde el detalle del producto</p>
                </>
              ) : (
                <Input id="stock_quantity" type="number" min="0" step={DECIMAL_UNITS.has(watchedValues.unit_of_measure) ? "any" : "1"} {...register("stock_quantity")} />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="min_stock">Stock de alerta</Label>
              <Input id="min_stock" type="number" min="0" step={DECIMAL_UNITS.has(watchedValues.unit_of_measure) ? "any" : "1"} placeholder="Ej: 5" {...register("min_stock")} />
              <p className="text-xs text-muted-foreground">Recibiras una notificacion push cuando el stock llegue a esta cantidad</p>
            </div>
          </div>
        )}

        {isComposite && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min_stock">Stock de alerta</Label>
              <Input id="min_stock" type="number" min="0" step="1" placeholder="Ej: 5" {...register("min_stock")} />
              <p className="text-xs text-muted-foreground">Recibiras una notificacion push cuando el stock calculado caiga por debajo de este valor</p>
            </div>
          </div>
        )}

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

        {/* Invoice + supplier RUC block when stock > 0 (only on create, simple products) */}
        {!isComposite && Number(watchedValues.stock_quantity) > 0 && !isEditing && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300 rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Datos de factura de compra</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supplier_ruc">
                  RUC del proveedor <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="supplier_ruc"
                  placeholder="20123456789"
                  maxLength={11}
                  {...register("supplier_ruc")}
                />
                {errors.supplier_ruc && (
                  <p className="text-xs text-destructive animate-in fade-in">{errors.supplier_ruc.message}</p>
                )}
                <p className="text-xs text-muted-foreground">RUC de 11 digitos del proveedor</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice_code">
                  Codigo de factura <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="invoice_code"
                  placeholder="F001-00001234"
                  {...register("invoice_code")}
                />
                {errors.invoice_code && (
                  <p className="text-xs text-destructive animate-in fade-in">{errors.invoice_code.message}</p>
                )}
                <p className="text-xs text-muted-foreground">Codigo de la factura de compra</p>
              </div>
            </div>
          </div>
        )}

        {/* Barcode section */}
        {isEditing ? (
          <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-4">
            <Label className="text-sm font-medium">Codigo de barras</Label>
            <Input value={product?.barcode || "Sin codigo"} disabled className="opacity-70" />
            <p className="text-xs text-muted-foreground">El codigo de barras no se puede modificar</p>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
            <Label className="text-sm font-medium">Codigo de barras</Label>

            {/* Mode toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setBarcodeMode("auto");
                  setValue("barcode", "");
                }}
                className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-all ${
                  barcodeMode === "auto"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary/50"
                }`}
              >
                Generar automaticamente
              </button>
              <button
                type="button"
                onClick={() => setBarcodeMode("manual")}
                className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-all ${
                  barcodeMode === "manual"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary/50"
                }`}
              >
                Tengo un codigo
              </button>
            </div>

            {/* Auto mode: format selector */}
            {barcodeMode === "auto" && (
              <div className="space-y-2 animate-[fadeIn_0.2s_ease-in]">
                <Label className="text-xs text-muted-foreground">Formato</Label>
                <Select
                  value={watchedValues.barcode_format || "EAN-13"}
                  onValueChange={(v) => setValue("barcode_format", v as "EAN-13" | "EAN-8")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EAN-13">
                      EAN-13 — Estandar internacional (13 digitos)
                    </SelectItem>
                    <SelectItem value="EAN-8">
                      EAN-8 — Productos pequenos (8 digitos)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Se generara automaticamente al crear el producto
                </p>
              </div>
            )}

            {/* Manual mode: input with validation */}
            {barcodeMode === "manual" && (
              <div className="space-y-2 animate-[fadeIn_0.2s_ease-in]">
                <div className="relative">
                  <Input
                    id="barcode"
                    placeholder="Ingresa un codigo EAN-13 o EAN-8"
                    maxLength={13}
                    {...register("barcode")}
                  />
                  {barcodeValue.length > 0 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {barcodeValid ? (
                        <Check className="size-4 text-emerald-500" />
                      ) : (
                        <X className="size-4 text-destructive" />
                      )}
                    </div>
                  )}
                </div>
                {barcodeValue.length > 0 && (
                  <p className={`text-xs font-medium ${barcodeValid ? "text-emerald-500" : "text-destructive"}`}>
                    {barcodeValid
                      ? `${detectedFormat} valido`
                      : barcodeValue.length !== 8 && barcodeValue.length !== 13
                        ? "Debe ser 8 digitos (EAN-8) o 13 digitos (EAN-13)"
                        : "Digito de control incorrecto"
                    }
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderTagsStep = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Selecciona las etiquetas que aplican a este {isService ? "servicio" : "producto"}.
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
        icon: isService ? <Briefcase className="size-4" /> : <Package className="size-4" />,
        rows: [
          ...(imagePreview ? [{ type: "image" as const, src: imagePreview }] : []),
          { label: "Nombre", value: watchedValues.name },
          ...(watchedValues.description ? [{ label: "Descripcion", value: watchedValues.description }] : []),
          { label: "Tipo", value: isService ? "Servicio" : (productKind === "composite" ? "Producto Compuesto" : "Producto Simple") },
          { label: "Categorias", value: selectedCatNames.length > 0 ? selectedCatNames.join(", ") : "Ninguna" },
          { label: "Sede", value: branches?.find((b) => b.id === watchedValues.branch_id)?.name || "—" },
        ],
      },
      {
        title: "Precios e impuestos",
        icon: <DollarSign className="size-4" />,
        rows: [
          { label: "Precio unitario", value: `${currency} ${Number(watchedValues.unit_price ?? 0).toFixed(2)}` },
          ...(Number(watchedValues.cost_price) > 0 ? [{ label: "Costo", value: `${currency} ${Number(watchedValues.cost_price).toFixed(2)}` }] : []),
          { label: "Moneda", value: watchedValues.currency === "PEN" ? "Soles (PEN)" : "Dolares (USD)" },
          { label: "Impuesto", value: watchedValues.tax_type === "gravado" ? `IGV ${watchedValues.igv_rate}%` : watchedValues.tax_type === "exonerado" ? "Exonerado" : "Inafecto" },
          ...(isService ? [{ label: "Unidad de medida", value: uomLabel }] : []),
        ],
      },
      // Recipe section — solo productos compuestos
      ...(!isService && productKind === "composite" ? [{
        title: "Receta",
        icon: <ChefHat className="size-4" />,
        rows: [
          ...recipeItems.map((ri) => ({
            label: ri.supply_name,
            value: `${ri.quantity_needed} ${ri.unit_of_measure}`,
          })),
          {
            label: "Stock calculado",
            value: recipeItems.length > 0
              ? `${Math.min(...recipeItems.map((ri) => ri.stock_quantity > 0 && ri.quantity_needed > 0 ? Math.floor(ri.stock_quantity / ri.quantity_needed) : 0))} unidades`
              : "0 unidades",
          },
        ] as SummaryRow[],
      }] : []),
      // Stock section — solo productos
      ...(!isService ? [{
        title: "Stock y codigo",
        icon: <BarChart3 className="size-4" />,
        rows: [
          ...(productKind === "composite"
            ? [{ label: "Tipo", value: "Compuesto (stock calculado)" }]
            : [{ label: "Stock inicial", value: String(watchedValues.stock_quantity ?? 0) }]
          ),
          { label: "Stock de alerta", value: String(watchedValues.min_stock ?? 0) },
          { label: "Unidad de medida", value: uomLabel },
          ...(productKind !== "composite" && Number(watchedValues.stock_quantity) > 0 ? [
            { label: "RUC proveedor", value: watchedValues.supplier_ruc || "—" },
            { label: "Factura", value: watchedValues.invoice_code || "—" },
          ] : []),
          { label: "Codigo de barras", value: watchedValues.barcode ? `${watchedValues.barcode} (manual)` : `Auto ${watchedValues.barcode_format || "EAN-13"}` },
        ] as SummaryRow[],
      }] : []),
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
                        Foto del {isService ? "servicio" : "producto"}
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
        steps={steps}
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

        {currentStep < steps.length - 1 ? (
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
