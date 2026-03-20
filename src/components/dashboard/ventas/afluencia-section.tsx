"use client";

import { QrCode } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function AfluenciaSection() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex h-[300px] flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <QrCode className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-foreground">
            Afluencia de Asistentes
          </h3>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Proximamente &mdash; Se habilitara cuando se implemente el sistema
            de escaneo QR
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
