"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";

import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useThemeStore } from "@/stores/theme-store";
import { useUpdatePreferences } from "@/hooks/queries/use-preferences";
import type { FontSize, Theme } from "@/stores/theme-store";

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

const FONT_OPTIONS: { value: FontSize; label: string; sample: string }[] = [
  { value: "sm", label: "Pequeno", sample: "Aa" },
  { value: "md", label: "Mediano", sample: "Aa" },
  { value: "lg", label: "Grande", sample: "Aa" },
];

const FONT_SIZE_PX: Record<FontSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export default function GeneralConfigPage() {
  const { theme, fontSize, setTheme, setFontSize } = useThemeStore();
  const updateMutation = useUpdatePreferences();

  const handleThemeChange = async (value: Theme) => {
    setTheme(value);
    const result = await updateMutation.mutateAsync({ theme: value });
    if (result.success) {
      toast.success("Tema actualizado");
    } else {
      toast.error("Error al guardar preferencia");
    }
  };

  const handleFontSizeChange = async (value: FontSize) => {
    setFontSize(value);
    const result = await updateMutation.mutateAsync({ font_size: value });
    if (result.success) {
      toast.success("Tamano de fuente actualizado");
    } else {
      toast.error("Error al guardar preferencia");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuracion General"
        description="Personalice la apariencia y preferencias del sistema"
      />

      {/* Theme */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tema</CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="text-sm text-muted-foreground mb-3 block">
              Seleccione el modo de apariencia del sistema
            </Label>
            <div className="grid grid-cols-3 gap-3">
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleThemeChange(opt.value)}
                    className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
                      isActive
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-5" />
                    <span className="text-xs font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Font Size */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tamano de Fuente</CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="text-sm text-muted-foreground mb-3 block">
              Ajuste el tamano del texto en toda la aplicacion
            </Label>
            <div className="grid grid-cols-3 gap-3">
              {FONT_OPTIONS.map((opt) => {
                const isActive = fontSize === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleFontSizeChange(opt.value)}
                    className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
                      isActive
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className={`font-semibold ${FONT_SIZE_PX[opt.value]}`}>
                      {opt.sample}
                    </span>
                    <span className="text-xs font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <Separator className="my-4" />

            <div className="rounded-lg border border-border/50 bg-secondary/30 p-4">
              <p className="text-sm text-muted-foreground">
                Vista previa del tamano seleccionado:
              </p>
              <p className={`mt-1 font-medium text-foreground ${FONT_SIZE_PX[fontSize]}`}>
                Este es un texto de ejemplo con el tamano &quot;{FONT_OPTIONS.find((o) => o.value === fontSize)?.label}&quot;.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
