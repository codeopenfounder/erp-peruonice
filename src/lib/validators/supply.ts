import { z } from "zod";

export const createSupplySchema = z.object({
  name: z.string().min(2, "Minimo 2 caracteres").max(200, "Maximo 200 caracteres"),
  description: z.string().max(1000, "Maximo 1000 caracteres").optional().or(z.literal("")),
  unit_of_measure: z.string().min(1).default("NIU"),
  stock_quantity: z.coerce.number().min(0).default(0),
  min_stock: z.coerce.number().min(0).optional(),
  cost_price: z.coerce.number().min(0).optional(),
  currency: z.enum(["PEN", "USD"]),
  branch_id: z.string().uuid("Sede requerida"),
  image_url: z.string().optional().or(z.literal("")),
  barcode: z.string().optional().or(z.literal("")),
  available_in_pos: z.boolean().default(false),
  category_ids: z.array(z.string().uuid()).optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
});

export type CreateSupplySchemaType = z.infer<typeof createSupplySchema>;

export const updateSupplySchema = createSupplySchema.partial().extend({
  image_url: z.string().optional(),
  is_active: z.boolean().optional(),
});

export type UpdateSupplySchemaType = z.infer<typeof updateSupplySchema>;

export const addSupplyStockSchema = z.object({
  quantity: z.coerce.number().min(0.001, "Cantidad minima: 0.001"),
  supplier_ruc: z
    .string()
    .min(11, "RUC debe tener 11 digitos")
    .max(11, "RUC debe tener 11 digitos")
    .regex(/^\d{11}$/, "RUC debe ser 11 digitos numericos"),
  invoice_code: z
    .string()
    .min(1, "Codigo de factura requerido")
    .regex(
      /^[A-Za-z0-9]{4}-\d{8}$/,
      "Formato: serie (4 chars) + guion + 8 digitos (ej: F001-00001234)"
    ),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type AddSupplyStockSchemaType = z.infer<typeof addSupplyStockSchema>;
