import { z } from "zod";

// --- Schedule ---

const timeRangeSchema = z.object({
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm requerido"),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm requerido"),
  capacity_override: z.coerce.number().int().min(1).optional().nullable(),
});

export const createScheduleSchema = z.object({
  product_id: z.string().uuid("Servicio requerido"),
  branch_id: z.string().uuid("Sede requerida"),
  name: z.string().max(100).optional().or(z.literal("")),
  interval_minutes: z.coerce.number().int().min(5, "Mínimo 5 minutos").max(480, "Máximo 8 horas"),
  default_capacity: z.coerce.number().int().min(1, "Mínimo 1").max(9999, "Máximo 9999"),
  days_of_week: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Seleccione al menos un día"),
  time_ranges: z.array(timeRangeSchema).min(1, "Agregue al menos un rango horario"),
});

export type CreateScheduleSchemaType = z.infer<typeof createScheduleSchema>;

export const updateScheduleSchema = z.object({
  name: z.string().max(100).optional().or(z.literal("")),
  interval_minutes: z.coerce.number().int().min(5).max(480).optional(),
  default_capacity: z.coerce.number().int().min(1).max(9999).optional(),
  days_of_week: z.array(z.coerce.number().int().min(0).max(6)).min(1).optional(),
  time_ranges: z.array(timeRangeSchema).min(1).optional(),
  is_active: z.boolean().optional(),
});

export type UpdateScheduleSchemaType = z.infer<typeof updateScheduleSchema>;

// --- Reservation ---

export const createReservationSchema = z.object({
  product_id: z.string().uuid("Servicio requerido"),
  branch_id: z.string().uuid("Sede requerida"),
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().max(200).optional().nullable(),
  invoice_id: z.string().uuid().optional().nullable(),
  reservation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD requerido"),
  slot_start: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm requerido"),
  slot_end: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:mm requerido"),
  quantity: z.coerce.number().int().min(1, "Mínimo 1 entrada"),
  notes: z.string().max(500).optional().nullable(),
});

export type CreateReservationSchemaType = z.infer<typeof createReservationSchema>;
