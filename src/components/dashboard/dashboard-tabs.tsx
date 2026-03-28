"use client";

import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { useDashboardFilters } from "./dashboard-filters-provider";
import { BarChart3, ShoppingBag, Users, ShieldAlert, Banknote } from "lucide-react";

import { VentasPanel } from "./ventas/ventas-panel";
import { ProductosPanel } from "./productos/productos-panel";
import { AsistenciaPanel } from "./asistencia/asistencia-panel";
import { OperativaPanel } from "./operativa/operativa-panel";
import { GastosPanel } from "./gastos/gastos-panel";

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
