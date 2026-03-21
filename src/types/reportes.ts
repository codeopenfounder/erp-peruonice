// --------------------------------------------------------------------------
// Report types for POI ERP
// --------------------------------------------------------------------------

export interface ReportFilters {
  date_from: string
  date_to: string
  branch_id?: string
  payment_method?: string
  cash_register_id?: string
  category_id?: string
}

// --- Report 1: Sabana General de Ventas ---

export interface SabanaVentasRow {
  id_transaccion: string
  fecha: string
  hora: string
  dia_semana: string
  serie_correlativo: string
  tipo_comprobante: string
  metodo_pago: string
  sede: string
  caja: string
  cajero: string
  monto_total_venta: number
  costo_total_tx: number
  margen_bruto: number
}

// --- Report 3: Control de Fugas ---

export interface ControlFugasRow {
  fecha: string
  hora: string
  tipo_evento: string
  producto_afectado: string
  cantidad: number
  monto_perdido: number
  costo_asumido: number
  motivo: string
  usuario_responsable: string
}

// --- Report 4: Rendimiento de Catalogo ---

export interface RendimientoCatalogoRow {
  fecha: string
  categoria_producto: string
  nombre_producto: string
  sku: string
  tipo_producto: string
  unidades_vendidas: number
  costo_unitario: number
  precio_venta_unitario: number
  ingreso_generado: number
  costo_generado: number
  ganancia_neta: number
}

// --- Report 5: Control Financiero y Caja ---

export interface ControlCajaRow {
  fecha: string
  hora_apertura: string
  hora_cierre: string
  caja: string
  codigo_caja: string
  sede: string
  estado: string
  monto_apertura: number
  monto_esperado: number
  monto_cierre_real: number
  descuadre: number
  cajero_apertura: string
  cajero_cierre: string
  notas: string
}

// --- Report 6: Rendimiento de Promociones ---

export interface RendimientoPromosRow {
  fecha: string
  hora: string
  nombre_promo: string
  codigo_promo: string
  tipo_descuento: string
  valor_descuento: number
  monto_descontado: number
  ingreso_real: number
  comprobante: string
}

// --- Report 7: Inventario Valorizado ---

export interface InventarioValorizadoRow {
  tipo: string
  sku: string
  nombre: string
  categoria: string
  stock_actual: number
  stock_minimo: number
  costo_unitario: number
  valor_total: number
  estado_stock: string
}

// --- Report 2: Trafico vs Entradas ---

export interface TraficoVsEntradasRow {
  fecha: string
  hora: string
  entradas_vendidas: number
  qrs_escaneados: number
  diferencia: number
}

// --- Report Metadata ---

export type ReportColor = "primary" | "blue" | "green" | "amber" | "purple" | "slate"

export interface ReportMeta {
  id: string
  name: string
  description: string
  color: ReportColor
  area: string
  comingSoon?: boolean
}
