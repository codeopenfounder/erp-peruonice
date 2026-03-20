import { z } from "zod";

// --- Product Category ---

export const createCategorySchema = z.object({
  name: z.string().min(2, "Minimo 2 caracteres").max(100, "Maximo 100 caracteres"),
  parent_id: z.string().uuid().optional().or(z.literal("")),
  type: z.enum(["product", "service", "both", "supply"]),
  sort_order: z.coerce.number().int().min(0).optional(),
});

export type CreateCategorySchemaType = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();

// --- Product Tag ---

export const createTagSchema = z.object({
  category_id: z.string().uuid("Categoria requerida"),
  name: z.string().min(1, "Nombre requerido").max(50, "Maximo 50 caracteres"),
  color: z.string().optional().or(z.literal("")),
  sort_order: z.coerce.number().int().min(0).optional(),
});

export type CreateTagSchemaType = z.infer<typeof createTagSchema>;

export const updateTagSchema = createTagSchema.partial().omit({ category_id: true });

// --- Product ---

export const createProductSchema = z.object({
  name: z.string().min(2, "Minimo 2 caracteres").max(200, "Maximo 200 caracteres"),
  description: z.string().max(1000, "Maximo 1000 caracteres").optional().or(z.literal("")),
  type: z.enum(["product", "service"]),
  product_kind: z.enum(["simple", "composite"]).default("simple"),
  recipe_items: z
    .array(
      z.object({
        supply_id: z.string().uuid(),
        quantity_needed: z.coerce.number().min(0.0001, "Cantidad debe ser mayor a 0"),
        unit_of_measure: z.string().default("NIU"),
      })
    )
    .optional(),
  category_ids: z.array(z.string().uuid()).optional(),
  image_url: z.string().optional().or(z.literal("")),
  unit_price: z.coerce.number().min(0, "El precio debe ser mayor o igual a 0"),
  cost_price: z.coerce.number().min(0).optional(),
  currency: z.enum(["PEN", "USD"]),
  tax_type: z.enum(["gravado", "exonerado", "inafecto"]),
  igv_rate: z.coerce.number().min(0).max(100).default(18),
  stock_quantity: z.coerce.number().min(0).default(0),
  min_stock: z.coerce.number().min(0).optional(),
  unit_of_measure: z.string().min(1).default("NIU"),
  invoice_code: z.string().optional().or(z.literal("")),
  supplier_ruc: z.string().optional().or(z.literal("")),
  barcode: z.string().optional().or(z.literal("")),
  barcode_format: z.enum(["EAN-13", "EAN-8"]).default("EAN-13"),
  branch_id: z.string().uuid("Sede requerida"),
  tag_ids: z.array(z.string().uuid()).optional(),
  is_schedulable: z.boolean().optional().default(false),
});

export type CreateProductSchemaType = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().extend({
  image_url: z.string().optional(),
  is_active: z.boolean().optional(),
});

export type UpdateProductSchemaType = z.infer<typeof updateProductSchema>;

// --- Stock ---

export const addStockSchema = z.object({
  quantity: z.coerce.number().min(0.001, "Cantidad minima: 0.001"),
  supplier_ruc: z.string().min(11, "RUC debe tener 11 digitos").max(11, "RUC debe tener 11 digitos").regex(/^\d{11}$/, "RUC debe ser 11 digitos numericos"),
  invoice_code: z.string().min(1, "Codigo de factura requerido").regex(/^[A-Za-z0-9]{4}-\d{8}$/, "Formato: serie (4 chars) + guion + 8 digitos (ej: F001-00001234)"),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type AddStockSchemaType = z.infer<typeof addStockSchema>;
