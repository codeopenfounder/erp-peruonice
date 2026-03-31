import { z } from "zod/v4"

export const createPaymentLinkSchema = z.object({
  product_id: z.string().uuid("Servicio requerido"),
  branch_id: z.string().uuid("Sede requerida"),
  reservation_date: z.string().min(1, "Fecha requerida"),
  slot_start: z.string().min(1, "Hora inicio requerida"),
  slot_end: z.string().min(1, "Hora fin requerida"),
  quantity: z.number().int().min(1, "Cantidad minima: 1"),
  customer_name: z.string().min(1, "Nombre del cliente requerido"),
  customer_email: z.string().email("Email invalido").optional().or(z.literal("")),
  customer_phone: z.string().optional(),
  customer_document_type: z.string().optional(),
  customer_document_number: z.string().optional(),
})

export type CreatePaymentLinkInput = z.infer<typeof createPaymentLinkSchema>
