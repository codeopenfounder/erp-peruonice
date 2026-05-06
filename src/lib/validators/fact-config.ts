import { z } from "zod";

export const factConfigSchema = z.object({
  ruc: z.string().regex(/^\d{11}$/, "El RUC debe tener 11 dígitos"),
  razon_social: z.string().min(2, "Razon social requerida"),
  direccion_fiscal: z.string().optional().or(z.literal("")),
  ubigeo: z.string().optional().or(z.literal("")),
  departamento: z.string().optional().or(z.literal("")),
  provincia: z.string().optional().or(z.literal("")),
  distrito: z.string().optional().or(z.literal("")),
  provider: z.enum(["apisunat", "bilme"]),
  api_token: z.string().optional().or(z.literal("")),
  logo_url: z.string().optional().or(z.literal("")),
  is_production: z.boolean(),
});

export type FactConfigSchemaType = z.infer<typeof factConfigSchema>;

export const invoiceSeriesSchema = z.object({
  series_code: z
    .string()
    .min(4, "Código de serie requerido")
    .max(4, "Máximo 4 caracteres")
    .regex(/^[A-Z]\d{3}$/, "Formato: letra + 3 dígitos (ej: F001, B001)"),
  document_type: z.enum([
    "factura",
    "boleta",
  ]),
  cash_register_id: z.string().uuid("Caja requerida"),
});

export type InvoiceSeriesSchemaType = z.infer<typeof invoiceSeriesSchema>;

export const invoiceSeriesEditSchema = z.object({
  cash_register_id: z.string().uuid("Caja requerida"),
});

export type InvoiceSeriesEditSchemaType = z.infer<typeof invoiceSeriesEditSchema>;

export const cashRegisterSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  branch_id: z.string().uuid("Sede requerida"),
});

export type CashRegisterSchemaType = z.infer<typeof cashRegisterSchema>;

export const cashRegisterEditSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  branch_id: z.string().uuid("Sede requerida"),
});

export type CashRegisterEditSchemaType = z.infer<typeof cashRegisterEditSchema>;

export const factUserAssignmentSchema = z.object({
  user_id: z.string().uuid("Empleado requerido"),
  cash_register_id: z.string().uuid("Caja requerida"),
});

export type FactUserAssignmentSchemaType = z.infer<typeof factUserAssignmentSchema>;

export const factUserEditSchema = z.object({
  cash_register_id: z.string().uuid("Caja requerida"),
});

export type FactUserEditSchemaType = z.infer<typeof factUserEditSchema>;
