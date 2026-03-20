import { z } from "zod";

// --- Capacity Group ---

export const createCapacityGroupSchema = z.object({
  branch_id: z.string().uuid("Sede requerida"),
  name: z.string().min(1, "Nombre requerido").max(100, "Maximo 100 caracteres"),
  shared_capacity: z.coerce.number().int().min(1, "Minimo 1").max(99999, "Maximo 99999"),
  schedule_ids: z.array(z.string().uuid()).min(1, "Seleccione al menos un horario"),
});

export type CreateCapacityGroupSchemaType = z.infer<typeof createCapacityGroupSchema>;

export const updateCapacityGroupSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(100, "Maximo 100 caracteres").optional(),
  shared_capacity: z.coerce.number().int().min(1, "Minimo 1").max(99999, "Maximo 99999").optional(),
  is_active: z.boolean().optional(),
  schedule_ids: z.array(z.string().uuid()).min(1, "Seleccione al menos un horario").optional(),
});

export type UpdateCapacityGroupSchemaType = z.infer<typeof updateCapacityGroupSchema>;
