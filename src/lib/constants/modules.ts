export type ModuleAction = "view" | "create" | "edit" | "delete"

export interface ModuleDefinition {
  code: string
  label: string
  description: string
  area: string
  availableActions: ModuleAction[]
}

export type ModuleArea = {
  key: string
  label: string
}

export const MODULE_AREAS: ModuleArea[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "ventas", label: "Ventas" },
  { key: "reservas", label: "Reservas" },
  { key: "inventario", label: "Inventario" },
  { key: "finanzas", label: "Finanzas" },
  { key: "gastos", label: "Gastos" },
  { key: "reportes", label: "Reportes" },
  { key: "config", label: "Configuración" },
]

export const ALL_MODULES: ModuleDefinition[] = [
  // Dashboard
  { code: "dashboard.kpis", label: "KPIs", description: "Indicadores clave del negocio", area: "dashboard", availableActions: ["view"] },
  // Ventas
  { code: "ventas.transacciones", label: "Transacciones", description: "Registro de transacciones de venta", area: "ventas", availableActions: ["view"] },
  { code: "ventas.comprobantes", label: "Comprobantes", description: "Visualización de comprobantes emitidos", area: "ventas", availableActions: ["view"] },
  { code: "ventas.clientes", label: "Clientes", description: "Gestión de clientes y datos fiscales", area: "ventas", availableActions: ["view", "delete"] },
  // Reservas
  { code: "reservas.horarios", label: "Horarios", description: "Horarios de atención de servicios", area: "reservas", availableActions: ["view", "create", "edit", "delete"] },
  { code: "reservas.reservas", label: "Reservas", description: "Gestión de reservas de clientes", area: "reservas", availableActions: ["view", "create", "edit", "delete"] },
  { code: "reservas.capacidad", label: "Capacidad", description: "Grupos de capacidad compartida entre servicios", area: "reservas", availableActions: ["view", "create", "edit", "delete"] },
  { code: "reservas.links", label: "Links de Pago", description: "Links de pago online para reservas (Culqi)", area: "reservas", availableActions: ["view", "create"] },
  // Inventario
  { code: "inventario.productos", label: "Productos", description: "Catálogo de productos e inventario", area: "inventario", availableActions: ["view", "create", "edit", "delete"] },
  { code: "inventario.servicios", label: "Servicios", description: "Catálogo de servicios ofrecidos", area: "inventario", availableActions: ["view", "create", "edit", "delete"] },
  { code: "inventario.insumos", label: "Insumos", description: "Materias primas e insumos", area: "inventario", availableActions: ["view", "create", "edit", "delete"] },
  { code: "inventario.promociones", label: "Promociones", description: "Descuentos y promociones", area: "inventario", availableActions: ["view", "create", "edit", "delete"] },
  { code: "inventario.movimientos", label: "Movimientos", description: "Mermas, pérdidas y ajustes de inventario", area: "inventario", availableActions: ["view", "create"] },
  { code: "inventario.auditoria", label: "Auditoría", description: "Auditoría de inventario físico", area: "inventario", availableActions: ["view", "create"] },
  // Finanzas
  { code: "finanzas.caja", label: "Caja", description: "Estado de cajas registradoras", area: "finanzas", availableActions: ["view"] },
  { code: "finanzas.cierres", label: "Cierres de Caja", description: "Historial de cierres de caja", area: "finanzas", availableActions: ["view"] },
  { code: "finanzas.arqueos", label: "Arqueos", description: "Arqueos y auditorías de caja", area: "finanzas", availableActions: ["view", "create"] },
  { code: "finanzas.movimientos", label: "Movimientos", description: "Movimientos de caja diarios", area: "finanzas", availableActions: ["view"] },
  // Gastos
  { code: "gastos.fondos", label: "Fondos de Gastos", description: "Gestión de fondos de gastos", area: "gastos", availableActions: ["view"] },
  { code: "gastos.movimientos", label: "Movimientos de Gastos", description: "Movimientos de fondos", area: "gastos", availableActions: ["view"] },
  // Reportes
  { code: "reportes.centro", label: "Centro de Reportes", description: "Reportes y análisis del negocio", area: "reportes", availableActions: ["view"] },
  // Configuración
  { code: "config.general", label: "General", description: "Preferencias del sistema", area: "config", availableActions: ["view"] },
  { code: "config.sedes", label: "Sedes", description: "Gestión de sucursales", area: "config", availableActions: ["view", "create", "edit"] },
  { code: "config.usuarios", label: "Usuarios y Acceso", description: "Gestión de usuarios y permisos", area: "config", availableActions: ["view", "create", "edit"] },
  { code: "config.poi_fact", label: "POI Fact", description: "Configuración del facturador POS", area: "config", availableActions: ["view", "create", "edit"] },
  { code: "config.poi_lector", label: "POI Lector", description: "Configuración del lector de acceso QR", area: "config", availableActions: ["view", "create", "edit"] },
  { code: "config.notificaciones", label: "Notificaciones", description: "Centro de notificaciones", area: "config", availableActions: ["view"] },
]

export function getModulesByArea(): Record<string, ModuleDefinition[]> {
  const grouped: Record<string, ModuleDefinition[]> = {}
  for (const area of MODULE_AREAS) {
    grouped[area.key] = ALL_MODULES.filter((m) => m.area === area.key)
  }
  return grouped
}

export function getModuleByCode(code: string): ModuleDefinition | undefined {
  return ALL_MODULES.find((m) => m.code === code)
}
