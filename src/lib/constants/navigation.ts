import {
  Home,
  Receipt,
  Users,
  Users2,
  Package,
  Briefcase,
  Warehouse,
  Ticket,
  ArrowLeftRight,
  ClipboardCheck,
  FileSearch,
  Monitor,
  CheckCircle,
  Wallet,
  Settings,
  Building2,
  Shield,
  FileBarChart,
  Bell,
  BarChart3,
  ShoppingCart,
  CalendarClock,
  CalendarCheck,
  QrCode,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  module?: string
  badge?: "unread_notifications"
}

export interface NavSection {
  key: string
  label: string
  collapsible?: boolean
  items: NavItem[]
}

export const SIDEBAR_NAVIGATION: NavSection[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: Home, module: "dashboard.kpis" },
    ],
  },
  {
    key: "ventas",
    label: "Ventas",
    collapsible: true,
    items: [
      { label: "Transacciones", href: "/ventas/transacciones", icon: ShoppingCart, module: "ventas.transacciones" },
      { label: "Comprobantes", href: "/ventas/comprobantes", icon: Receipt, module: "ventas.comprobantes" },
      { label: "Clientes", href: "/ventas/clientes", icon: Users, module: "ventas.clientes" },
    ],
  },
  {
    key: "reservas",
    label: "Reservas",
    collapsible: true,
    items: [
      { label: "Horarios", href: "/reservas/horarios", icon: CalendarClock, module: "reservas.horarios" },
      { label: "Reservas", href: "/reservas/reservas", icon: CalendarCheck, module: "reservas.reservas" },
      { label: "Capacidad", href: "/reservas/capacidad", icon: Users2, module: "reservas.capacidad" },
    ],
  },
  {
    key: "inventario",
    label: "Inventario",
    collapsible: true,
    items: [
      { label: "Productos", href: "/inventario/productos", icon: Package, module: "inventario.productos" },
      { label: "Servicios", href: "/inventario/servicios", icon: Briefcase, module: "inventario.servicios" },
      { label: "Insumos", href: "/inventario/insumos", icon: Warehouse, module: "inventario.insumos" },
      { label: "Promociones", href: "/inventario/promociones", icon: Ticket, module: "inventario.promociones" },
      { label: "Movimientos", href: "/inventario/movimientos", icon: ArrowLeftRight, module: "inventario.movimientos" },
      { label: "Auditoría", href: "/inventario/auditoria", icon: ClipboardCheck, module: "inventario.auditoria" },
    ],
  },
  {
    key: "finanzas",
    label: "Finanzas",
    collapsible: true,
    items: [
      { label: "Caja", href: "/finanzas/caja", icon: Monitor, module: "finanzas.caja" },
      { label: "Cierres de Caja", href: "/finanzas/cierres", icon: CheckCircle, module: "finanzas.cierres" },
      { label: "Arqueos", href: "/finanzas/arqueos", icon: FileSearch, module: "finanzas.arqueos" },
      { label: "Movimientos", href: "/finanzas/movimientos", icon: ArrowLeftRight, module: "finanzas.movimientos" },
    ],
  },
  {
    key: "gastos",
    label: "Gastos",
    collapsible: true,
    items: [
      { label: "Fondos de Gastos", href: "/gastos/fondos", icon: Wallet, module: "gastos.fondos" },
      { label: "Movimientos", href: "/gastos/movimientos", icon: ArrowLeftRight, module: "gastos.movimientos" },
    ],
  },
  {
    key: "reportes",
    label: "Reportes",
    items: [
      { label: "Centro de Reportes", href: "/reportes", icon: BarChart3, module: "reportes.centro" },
    ],
  },
  {
    key: "config",
    label: "Configuración",
    collapsible: true,
    items: [
      { label: "General", href: "/config/general", icon: Settings, module: "config.general" },
      { label: "Sedes", href: "/config/sedes", icon: Building2, module: "config.sedes" },
      { label: "Usuarios y Acceso", href: "/config/usuarios", icon: Shield, module: "config.usuarios" },
      { label: "POI Fact", href: "/config/poi-fact", icon: FileBarChart, module: "config.poi_fact" },
      { label: "POI Lector", href: "/config/poi-lector", icon: QrCode, module: "config.poi_lector" },
      { label: "Notificaciones", href: "/config/notificaciones", icon: Bell, module: "config.notificaciones", badge: "unread_notifications" },
    ],
  },
]
