import { z } from "zod";

// Helper: treat empty strings as undefined for optional numeric fields
// (empty = "no restriction", 0 = valid value that flows through change detection)
const optionalInt = (min: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(min).optional()
  );

const optionalNum = (min: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(min).optional()
  );

export const createPromotionSchema = z
  .object({
    code: z.string().min(2, "Mínimo 2 caracteres").max(30, "Máximo 30 caracteres"),
    name: z.string().min(2, "Mínimo 2 caracteres").max(200, "Máximo 200 caracteres"),
    description: z.string().max(500).optional().or(z.literal("")),
    discount_type: z.enum(["percentage", "fixed_amount"]),
    discount_value: z.coerce.number().min(0, "Valor de descuento requerido"),
    applies_to: z.enum(["all", "products", "services"]),
    min_purchase_amount: optionalNum(0),
    max_discount_amount: optionalNum(0),
    min_quantity: optionalInt(0),
    applies_every: optionalInt(0),
    stock: optionalInt(0),
    max_uses_per_customer: optionalInt(0),
    valid_from: z.string().optional().or(z.literal("")),
    valid_until: z.string().optional().or(z.literal("")),
    restricted_hour_from: z.string().optional().or(z.literal("")),
    restricted_hour_until: z.string().optional().or(z.literal("")),
    branch_ids: z.array(z.string().uuid()).min(1, "Selecciona al menos una sede"),
    category_ids: z.array(z.string().uuid()).default([]),
    tag_ids: z.array(z.string().uuid()).optional(),
    is_combo: z.boolean().default(false),
    combo_price: optionalNum(0.01),
    combo_items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.coerce.number().int().min(1) })).optional(),
  })
  .refine(
    (data) => {
      if (data.discount_type === "percentage" && data.discount_value != null) {
        return data.discount_value <= 100;
      }
      return true;
    },
    { message: "El porcentaje no puede ser mayor a 100", path: ["discount_value"] }
  )
  .refine(
    (data) => {
      if (data.valid_from && data.valid_until) {
        return new Date(data.valid_until) >= new Date(data.valid_from);
      }
      return true;
    },
    { message: "La fecha final no puede ser anterior a la fecha de inicio", path: ["valid_until"] }
  )
  .refine(
    (data) => {
      if (data.restricted_hour_from && data.restricted_hour_until) {
        return data.restricted_hour_until >= data.restricted_hour_from;
      }
      return true;
    },
    { message: "La hora final no puede ser anterior a la hora de inicio", path: ["restricted_hour_until"] }
  );

export type CreatePromotionSchemaType = z.infer<typeof createPromotionSchema>;

export const updatePromotionSchema = z.object({
  code: z.string().min(2).max(30).optional(),
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(500).optional().or(z.literal("")),
  discount_type: z.enum(["percentage", "fixed_amount"]).optional(),
  discount_value: z.coerce.number().min(0).optional(),
  applies_to: z.enum(["all", "products", "services"]).optional(),
  min_purchase_amount: optionalNum(0),
  max_discount_amount: optionalNum(0),
  min_quantity: optionalInt(0),
  applies_every: optionalInt(0),
  stock: optionalInt(0),
  max_uses_per_customer: optionalInt(0),
  valid_from: z.string().optional().or(z.literal("")),
  valid_until: z.string().optional().or(z.literal("")),
  restricted_hour_from: z.string().optional().or(z.literal("")),
  restricted_hour_until: z.string().optional().or(z.literal("")),
  is_active: z.boolean().optional(),
  branch_ids: z.array(z.string().uuid()).optional(),
  category_ids: z.array(z.string().uuid()).optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
});

export type UpdatePromotionSchemaType = z.infer<typeof updatePromotionSchema>;
