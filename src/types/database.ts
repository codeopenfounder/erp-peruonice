// --------------------------------------------------------------------------
// Identidad y tenant — los tres tipos que el ERP usa de verdad
// --------------------------------------------------------------------------
//
// ⚠️ ESTE FICHERO NO ESTÁ GENERADO. No lo produce `supabase gen types` y no
//    existe ningún script `db:types` en el proyecto: está escrito a mano.
//
// Por qué se podó
// ---------------
// Tenía 432 líneas y **36 tipos exportados**, de los cuales el código importaba
// tres. Iba 37 migraciones por detrás del esquema real, y eso lo convertía en una
// trampa silenciosa: declaraba `invoices.branch_id` —la columna que NO existe y que
// provocó el bug del webhook de Culqi, donde PostgREST rechazaba el INSERT entero y
// cada pago online se quedaba sin comprobante—, llamaba `series` y `current_number`
// a lo que en la base son `series_code` y `current_correlative`, le faltaban valores
// reales de `document_type`, y su `FactConfig` describía configuración de impresora
// que en realidad vive en la SQLite del POS.
//
// Nada había estallado porque sólo dos ficheros lo importaban. El riesgo era el de
// después: quien importara `Invoice` de aquí creyendo que son tipos generados
// compilaría en verde contra columnas inexistentes.
//
// Dónde están los tipos de verdad
// -------------------------------
// | Dominio | Fichero |
// |---|---|
// | Comprobantes, caja, series, fact_config | `@/types/invoice` |
// | Productos y servicios | `@/types/product` |
// | Insumos | `@/types/supply` |
// | Movimientos de inventario | `@/types/inventory-movement` |
// | Auditorías | `@/types/inventory-audit` |
// | Permisos por módulo | `@/types/auth` |
//
// Generarlo de verdad exige el CLI de Supabase apuntando a producción. Está anotado
// en `docs/pendiente-notas-y-multipos.md`.

/** Cargos de POI. Gobiernan a qué app entra cada persona. */
export type Cargo = "gerente" | "supervisor" | "cajero" | "control_acceso"

export interface Tenant {
  id: string
  name: string
  slug: string
  ruc: string | null
  razon_social: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  tenant_id: string
  email: string
  first_name: string
  last_name: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  cargo: Cargo
  is_owner: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}
