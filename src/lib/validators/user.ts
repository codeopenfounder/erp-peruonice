import { z } from "zod";

export const CARGO_OPTIONS = ["gerente", "supervisor", "cajero", "control_acceso"] as const;
export type Cargo = (typeof CARGO_OPTIONS)[number];

// Base fields shared across all cargos
const baseFields = {
  first_name: z.string().min(1, "Nombre requerido"),
  last_name: z.string().min(1, "Apellido requerido"),
  cargo: z.enum(CARGO_OPTIONS, { message: "Cargo requerido" }),
  pin_code: z.string().regex(/^\d{4}$/, "PIN debe ser exactamente 4 dígitos"),
};

// For gerente/supervisor (need email + password for web access)
export const createWebUserSchema = z.object({
  ...baseFields,
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

// For cajero (no email/password — POS only)
export const createCajeroSchema = z.object({
  ...baseFields,
});

// Discriminated union: cargo determines which fields are required
export const createUserSchema = z.discriminatedUnion("cargo", [
  z.object({
    ...baseFields,
    cargo: z.literal("gerente"),
    email: z.string().email("Email inválido"),
    password: z.string().min(6, "Mínimo 6 caracteres"),
  }),
  z.object({
    ...baseFields,
    cargo: z.literal("supervisor"),
    email: z.string().email("Email inválido"),
    password: z.string().min(6, "Mínimo 6 caracteres"),
  }),
  z.object({
    ...baseFields,
    cargo: z.literal("cajero"),
  }),
  z.object({
    ...baseFields,
    cargo: z.literal("control_acceso"),
  }),
]);

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  first_name: z.string().min(1, "Nombre requerido"),
  last_name: z.string().min(1, "Apellido requerido"),
});

export const userPermissionSchema = z.object({
  module_code: z.string(),
  can_view: z.boolean(),
  can_create: z.boolean(),
  can_edit: z.boolean(),
  can_delete: z.boolean(),
});

export const updatePermissionsSchema = z.array(userPermissionSchema);

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserPermissionInput = z.infer<typeof userPermissionSchema>;
