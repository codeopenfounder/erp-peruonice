import { z } from "zod/v4"

export const createSurpriseArqueoSchema = z.object({
  cash_register_id: z.string().uuid("Caja requerida"),
  denomination_counts: z.record(z.string(), z.number().int().min(0)),
  counted_amount: z.number().min(0, "Monto contado requerido"),
  supervisor_id: z.string().uuid("Supervisor requerido"),
  supervisor_name: z.string().min(1, "Nombre de supervisor requerido"),
  notes: z.string().optional(),
})

export type CreateSurpriseArqueoInput = z.infer<typeof createSurpriseArqueoSchema>
