"use client"

import { useState } from "react"
import {
  Receipt,
  ShieldAlert,
  BarChart3,
  Landmark,
  Tag,
  Package,
  ScanLine,
} from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { ReportHubCard } from "@/components/reportes/report-hub-card"
import { SabanaVentasReport } from "@/components/reportes/reports/sabana-ventas-report"
import { ControlFugasReport } from "@/components/reportes/reports/control-fugas-report"
import { RendimientoCatalogoReport } from "@/components/reportes/reports/rendimiento-catalogo-report"
import { ControlCajaReport } from "@/components/reportes/reports/control-caja-report"
import { RendimientoPromosReport } from "@/components/reportes/reports/rendimiento-promos-report"
import { InventarioValorizadoReport } from "@/components/reportes/reports/inventario-valorizado-report"
import type { ReportColor } from "@/types/reportes"
import type { LucideIcon } from "lucide-react"

interface ReportCard {
  id: string
  icon: LucideIcon
  title: string
  description: string
  area: string
  color: ReportColor
  comingSoon?: boolean
}

const REPORTS: ReportCard[] = [
  {
    id: "sabana-ventas",
    icon: Receipt,
    title: "Sabana de Ventas",
    description: "Todas las transacciones con monto, costo y margen bruto por comprobante.",
    area: "Ventas",
    color: "primary",
  },
  {
    id: "control-fugas",
    icon: ShieldAlert,
    title: "Control de Fugas",
    description: "Anulaciones, mermas, cortesias y todo el dinero que no ingreso a caja.",
    area: "Operaciones",
    color: "purple",
  },
  {
    id: "rendimiento-catalogo",
    icon: BarChart3,
    title: "Mix de Productos",
    description: "Rendimiento de cada producto vendido con costo, ingreso y ganancia.",
    area: "Inventario",
    color: "blue",
  },
  {
    id: "control-caja",
    icon: Landmark,
    title: "Control de Caja",
    description: "Aperturas, cierres y descuadres de caja para auditoria financiera.",
    area: "Finanzas",
    color: "green",
  },
  {
    id: "rendimiento-promos",
    icon: Tag,
    title: "Rendimiento de Promos",
    description: "Uso de promociones y cupones con monto descontado e ingreso real.",
    area: "Marketing",
    color: "amber",
  },
  {
    id: "inventario-valorizado",
    icon: Package,
    title: "Inventario Valorizado",
    description: "Stock actual de productos e insumos con costo unitario y valor total.",
    area: "Inventario",
    color: "blue",
  },
  {
    id: "trafico-asistentes",
    icon: ScanLine,
    title: "Trafico vs Entradas",
    description: "Entradas vendidas vs QRs escaneados en pista para medir conversion.",
    area: "Operaciones",
    color: "slate",
    comingSoon: true,
  },
]

export default function ReportesPage() {
  const [activeReport, setActiveReport] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Centro de Reportes"
        description="Exporta datos planos para analisis en Excel. Cada reporte genera flat data sin totales ni celdas combinadas."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report, i) => (
          <ReportHubCard
            key={report.id}
            icon={report.icon}
            title={report.title}
            description={report.description}
            area={report.area}
            color={report.color}
            index={i}
            comingSoon={report.comingSoon}
            onClick={() => setActiveReport(report.id)}
          />
        ))}
      </div>

      {/* Report Dialogs */}
      <SabanaVentasReport
        open={activeReport === "sabana-ventas"}
        onOpenChange={(open) => !open && setActiveReport(null)}
      />
      <ControlFugasReport
        open={activeReport === "control-fugas"}
        onOpenChange={(open) => !open && setActiveReport(null)}
      />
      <RendimientoCatalogoReport
        open={activeReport === "rendimiento-catalogo"}
        onOpenChange={(open) => !open && setActiveReport(null)}
      />
      <ControlCajaReport
        open={activeReport === "control-caja"}
        onOpenChange={(open) => !open && setActiveReport(null)}
      />
      <RendimientoPromosReport
        open={activeReport === "rendimiento-promos"}
        onOpenChange={(open) => !open && setActiveReport(null)}
      />
      <InventarioValorizadoReport
        open={activeReport === "inventario-valorizado"}
        onOpenChange={(open) => !open && setActiveReport(null)}
      />
    </div>
  )
}
