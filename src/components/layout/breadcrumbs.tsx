"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ChevronRight } from "lucide-react";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  // Ventas
  ventas: "Ventas",
  comprobantes: "Comprobantes",
  clientes: "Clientes",
  // Inventario
  inventario: "Inventario",
  productos: "Productos",
  servicios: "Servicios",
  insumos: "Insumos",
  promociones: "Promociones",
  movimientos: "Movimientos",
  auditoria: "Auditoría",
  // Finanzas
  finanzas: "Finanzas",
  caja: "Caja",
  cierres: "Cierres de Caja",
  fondos: "Fondos de Gastos",
  // Config
  config: "Configuracion",
  general: "General",
  sedes: "Sedes",
  usuarios: "Usuarios y Acceso",
  "poi-fact": "POI Fact",
  notificaciones: "Notificaciones",
  perfil: "Mi Perfil",
  // Common
  nuevo: "Nuevo",
  editar: "Editar",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm overflow-x-auto scrollbar-hide whitespace-nowrap">
      <Link
        href="/dashboard"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <Home className="size-4" />
      </Link>

      {segments.map((segment, index) => {
        const href = "/" + segments.slice(0, index + 1).join("/");
        const label = SEGMENT_LABELS[segment] ?? segment;
        const isLast = index === segments.length - 1;

        return (
          <span key={href} className="flex items-center gap-1.5">
            <ChevronRight className="size-3.5 text-muted-foreground" />
            {isLast ? (
              <span className="font-medium text-foreground">{label}</span>
            ) : (
              <Link
                href={href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
