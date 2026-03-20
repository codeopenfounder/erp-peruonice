import { z } from "zod";

export const createInventoryMovementSchema = z.object({
  entity_type: z.enum(["product", "supply"]),
  entity_id: z.string().uuid("Entidad requerida"),
  quantity: z.coerce.number().min(0.001, "Cantidad minima: 0.001"),
  movement_type: z.enum([
    "waste",
    "shrinkage",
    "staff_consumption",
    "breakage",
    "adjustment",
    "transfer",
    "income",
    "outcome",
  ]),
  reason: z.string().max(500).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  branch_id: z.string().uuid("Sede requerida"),
});

export type CreateInventoryMovementSchemaType = z.infer<
  typeof createInventoryMovementSchema
>;
