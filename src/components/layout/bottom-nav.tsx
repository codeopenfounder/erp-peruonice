"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  Receipt,
  Package,
  Bell,
  Users,
  Briefcase,
  Warehouse,
  Ticket,
  ArrowLeftRight,
  ClipboardCheck,
  Monitor,
  CheckCircle,
  Wallet,
  Settings,
  Building2,
  Shield,
  FileBarChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/theme-store";

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------
const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  Receipt,
  Package,
  Bell,
  Users,
  Briefcase,
  Warehouse,
  Ticket,
  ArrowLeftRight,
  ClipboardCheck,
  Monitor,
  CheckCircle,
  Wallet,
  Settings,
  Building2,
  Shield,
  FileBarChart,
};

// href -> icon name + label for resolution
const ROUTE_META: Record<string, { icon: string; label: string }> = {
  "/dashboard": { icon: "Home", label: "Home" },
  // Ventas
  "/ventas/comprobantes": { icon: "Receipt", label: "Comprobantes" },
  "/ventas/clientes": { icon: "Users", label: "Clientes" },
  // Inventario
  "/inventario/productos": { icon: "Package", label: "Productos" },
  "/inventario/servicios": { icon: "Briefcase", label: "Servicios" },
  "/inventario/insumos": { icon: "Warehouse", label: "Insumos" },
  "/inventario/promociones": { icon: "Ticket", label: "Promociones" },
  "/inventario/movimientos": { icon: "ArrowLeftRight", label: "Movimientos" },
  "/inventario/auditoria": { icon: "ClipboardCheck", label: "Auditoría" },
  // Finanzas
  "/finanzas/caja": { icon: "Monitor", label: "Caja" },
  "/finanzas/cierres": { icon: "CheckCircle", label: "Cierres" },
  "/finanzas/movimientos": { icon: "ArrowLeftRight", label: "Movimientos" },
  // Gastos
  "/gastos/fondos": { icon: "Wallet", label: "Fondos" },
  "/gastos/movimientos": { icon: "ArrowLeftRight", label: "Movimientos" },
  // Config
  "/config/general": { icon: "Settings", label: "Config" },
  "/config/sedes": { icon: "Building2", label: "Sedes" },
  "/config/usuarios": { icon: "Shield", label: "Usuarios" },
  "/config/poi-fact": { icon: "FileBarChart", label: "POI Fact" },
  "/config/notificaciones": { icon: "Bell", label: "Alertas" },
};

const DEFAULT_QUICK_ACCESS = [
  "/dashboard",
  "/ventas/comprobantes",
  "/inventario/productos",
  "/config/notificaciones",
];

export function BottomNav() {
  const pathname = usePathname();
  const quickAccess = useThemeStore((s) => s.quickAccess);

  const routes = quickAccess.length === 4 ? quickAccess : DEFAULT_QUICK_ACCESS;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      {/* Background bar */}
      <div className="relative flex h-16 items-end border-t border-border bg-card/95 backdrop-blur-md">
        {routes.map((href) => (
          <NavItem key={href} href={href} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Individual nav item
// ---------------------------------------------------------------------------
function NavItem({ href, pathname }: { href: string; pathname: string }) {
  const meta = ROUTE_META[href];
  if (!meta) return null;

  const Icon = ICON_MAP[meta.icon] ?? Home;
  const isActive = pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors duration-200",
        isActive ? "text-primary" : "text-muted-foreground"
      )}
    >
      <Icon className="size-5" />
      <span className="truncate max-w-[60px]">{meta.label}</span>
    </Link>
  );
}
