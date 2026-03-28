import { z } from "zod";

export const createAuditSchema = z.object({
  branch_id: z.string().uuid("Sede requerida"),
  notes: z.string().max(500).optional().or(z.literal("")),
  items: z.array(z.object({
    entity_type: z.enum(["product", "supply"]),
    entity_id: z.string().uuid(),
    entity_name: z.string(),
    entity_sku: z.string(),
    cost_price: z.coerce.number(),
    theoretical_stock: z.coerce.number(),
    physical_stock: z.coerce.number().min(0, "Stock no puede ser negativo"),
    difference: z.coerce.number(),
    cost_impact: z.coerce.number(),
  })).min(1, "Debe incluir al menos un item"),
  responsible_id: z.string().uuid().optional(),
});

export type CreateAuditSchemaType = z.infer<typeof createAuditSchema>;
