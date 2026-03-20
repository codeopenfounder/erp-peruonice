"use client"

import type { LucideIcon } from "lucide-react"
import { motion } from "motion/react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { ReportColor } from "@/types/reportes"

const COLOR_MAP: Record<ReportColor, { icon: string; border: string; bg: string; badge: string }> = {
  primary: { icon: "text-primary", border: "hover:border-primary/40", bg: "bg-primary/10", badge: "bg-primary/10 text-primary border-primary/20" },
  blue: { icon: "text-blue-600", border: "hover:border-blue-400/40", bg: "bg-blue-100", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  green: { icon: "text-emerald-600", border: "hover:border-emerald-400/40", bg: "bg-emerald-100", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  amber: { icon: "text-amber-600", border: "hover:border-amber-400/40", bg: "bg-amber-100", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  purple: { icon: "text-purple-600", border: "hover:border-purple-400/40", bg: "bg-purple-100", badge: "bg-purple-50 text-purple-700 border-purple-200" },
  slate: { icon: "text-muted-foreground", border: "hover:border-muted-foreground/30", bg: "bg-muted", badge: "bg-muted text-muted-foreground border-border" },
}

interface ReportHubCardProps {
  icon: LucideIcon
  title: string
  description: string
  area: string
  color: ReportColor
  index: number
  comingSoon?: boolean
  onClick: () => void
}

export function ReportHubCard({
  icon: Icon,
  title,
  description,
  area,
  color,
  index,
  comingSoon,
  onClick,
}: ReportHubCardProps) {
  const colors = COLOR_MAP[color]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: "easeOut" }}
    >
      <Card
        className={`group relative cursor-pointer border-border/60 transition-all duration-200 ${colors.border} hover:shadow-md ${comingSoon ? "opacity-60 pointer-events-none" : ""}`}
        onClick={comingSoon ? undefined : onClick}
      >
        <CardContent className="flex flex-col gap-3 p-5">
          <div className="flex items-start justify-between">
            <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${colors.bg}`}>
              <Icon className={`size-5 ${colors.icon}`} />
            </div>
            <Badge variant="outline" className={`text-[10px] font-medium ${colors.badge}`}>
              {area}
            </Badge>
          </div>

          <div>
            <h3 className="text-sm font-semibold leading-tight">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
          </div>

          {comingSoon && (
            <Badge variant="secondary" className="mt-1 w-fit text-[10px]">
              Proximamente
            </Badge>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
