"use client";

import dynamic from "next/dynamic";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardFilters } from "./dashboard-filters-provider";
import { BarChart3, ShoppingBag, Users, ShieldAlert, Banknote } from "lucide-react";

const PanelSkeleton = () => (
  <div className="space-y-4">
    <div className="grid gap-4 md:grid-cols-4">
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
    <Skeleton className="h-80" />
  </div>
);

const VentasPanel = dynamic(
  () => import("./ventas/ventas-panel").then((m) => ({ default: m.VentasPanel })),
  { ssr: false, loading: () => <PanelSkeleton /> },
);
const ProductosPanel = dynamic(
  () => import("./productos/productos-panel").then((m) => ({ default: m.ProductosPanel })),
  { ssr: false, loading: () => <PanelSkeleton /> },
);
const AsistenciaPanel = dynamic(
  () => import("./asistencia/asistencia-panel").then((m) => ({ default: m.AsistenciaPanel })),
  { ssr: false, loading: () => <PanelSkeleton /> },
);
const OperativaPanel = dynamic(
  () => import("./operativa/operativa-panel").then((m) => ({ default: m.OperativaPanel })),
  { ssr: false, loading: () => <PanelSkeleton /> },
);
const GastosPanel = dynamic(
  () => import("./gastos/gastos-panel").then((m) => ({ default: m.GastosPanel })),
  { ssr: false, loading: () => <PanelSkeleton /> },
);

const TABS = [
  { value: "ventas", label: "Ventas", icon: BarChart3 },
  { value: "productos", label: "Productos", icon: ShoppingBag },
  { value: "asistencia", label: "Asistencia", icon: Users },
  { value: "operativa", label: "Eficiencia", icon: ShieldAlert },
  { value: "gastos", label: "Gastos", icon: Banknote },
] as const;

export function DashboardTabs() {
  const { activeTab, setActiveTab } = useDashboardFilters();

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList
        variant="line"
        className="w-full justify-start overflow-x-auto"
      >
        {TABS.map(({ value, label, icon: Icon }) => (
          <TabsTrigger key={value} value={value} className="gap-1.5">
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="ventas" className="mt-4">
        <VentasPanel />
      </TabsContent>

      <TabsContent value="productos" className="mt-4">
        <ProductosPanel />
      </TabsContent>

      <TabsContent value="asistencia" className="mt-4">
        <AsistenciaPanel />
      </TabsContent>

      <TabsContent value="operativa" className="mt-4">
        <OperativaPanel />
      </TabsContent>

      <TabsContent value="gastos" className="mt-4">
        <GastosPanel />
      </TabsContent>
    </Tabs>
  );
}
