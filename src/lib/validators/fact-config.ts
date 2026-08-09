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
  detraction_account: z
    .string()
    .regex(/^[\d-]{0,30}$/, "Solo números y guiones")
    .optional()
    .or(z.literal("")),
});

export type FactConfigSchemaType = z.infer<typeof factConfigSchema>;

/**
 * Primer carácter de la serie según el Anexo N.° 3 de la RS 097-2012/SUNAT
 * (sustituido por la RS 114-2019): "F" para lo que factura o modifica facturas,
 * "B" para boletas y sus notas. Incumplirlo produce el rechazo 2345
 * ("La serie no corresponde al tipo de comprobante").
 */
const SERIES_PREFIX_BY_DOCUMENT: Record<string, "F" | "B"> = {
  factura: "F",
  nota_credito_factura: "F",
  nota_debito_factura: "F",
  boleta: "B",
  nota_credito_boleta: "B",
  nota_debito_boleta: "B",
};

export const invoiceSeriesSchema = z
  .object({
    series_code: z
      .string()
      .length(4, "La serie debe tener exactamente 4 caracteres")
      // SUNAT admite 4 alfanuméricos, no solo letra + 3 dígitos: las series de
      // notas de la convención habitual (FC01, BD01) no son numéricas.
      .regex(/^[A-Z][A-Z0-9]{3}$/, "Formato: letra + 3 alfanuméricos (ej: F001, FC01)"),
    document_type: z.enum([
      "factura",
      "boleta",
      "nota_credito_factura",
      "nota_credito_boleta",
      "nota_debito_factura",
      "nota_debito_boleta",
    ]),
    cash_register_id: z.string().uuid("Caja requerida"),
  })
  .superRefine((v, ctx) => {
    const expected = SERIES_PREFIX_BY_DOCUMENT[v.document_type];
    if (expected && !v.series_code.startsWith(expected)) {
      ctx.addIssue({
        code: "custom",
        path: ["series_code"],
        message: `SUNAT exige que la serie empiece con "${expected}" para este tipo de documento`,
      });
    }
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
