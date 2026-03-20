import { z } from "zod";

export const createBranchSchema = z.object({
  name: z.string().min(2, "Minimo 2 caracteres"),
  type: z.enum(["sede_principal", "sucursal", "oficina", "almacen", "planta"]),
  is_main: z.boolean().default(false),
  address: z.string().optional(),
  department: z.string().optional(),
  province: z.string().optional(),
  district: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email invalido").optional().or(z.literal("")),
  manager_id: z.string().uuid().optional().or(z.literal("")),
});

export const updateBranchSchema = createBranchSchema.partial();

export type CreateBranchSchemaType = z.infer<typeof createBranchSchema>;
export type UpdateBranchSchemaType = z.infer<typeof updateBranchSchema>;
