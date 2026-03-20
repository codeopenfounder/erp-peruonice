import { z } from "zod";

export const pettyCashSchema = z.object({
  cash_register_id: z.string().uuid("Caja requerida"),
  amount: z.coerce.number().min(0.01, "El monto debe ser mayor a 0"),
  current_balance: z.coerce.number(),
});

export const adjustExpenseFundSchema = z.object({
  cash_register_id: z.string().uuid("Caja requerida"),
  new_amount: z.coerce.number().min(0, "El monto no puede ser negativo"),
  pin: z.string().length(4, "El PIN debe ser de 4 dígitos").regex(/^\d{4}$/, "El PIN debe ser numérico"),
});

export type PettyCashInput = z.infer<typeof pettyCashSchema>;
export type AdjustExpenseFundInput = z.infer<typeof adjustExpenseFundSchema>;
