"use client";

import { useRef, useEffect, useCallback } from "react";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import bwipjs from "bwip-js/browser";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBwipBcid } from "@/lib/utils/barcode";

interface BarcodeDisplayProps {
  value: string;
  label?: string;
}

function getBwipOptions(value: string) {
  const bcid = getBwipBcid(value);
  return {
    bcid,
    text: value,
    scale: 3,
    height: bcid === "ean13" ? 22.85 : bcid === "ean8" ? 18.23 : 15,
    includetext: true,
    textxalign: "center" as const,
    guardwhitespace: bcid !== "code128",
    backgroundcolor: "ffffff",
    barcolor: "000000",
    paddingleft: bcid === "ean13" ? 12 : 8,
    paddingright: bcid === "ean13" ? 8 : 8,
    paddingtop: 2,
    paddingbottom: 2,
  };
}

export function BarcodeDisplay({ value, label }: BarcodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && value) {
      try {
        bwipjs.toCanvas(canvasRef.current, getBwipOptions(value));
      } catch {
        // Fallback: show value as text if barcode rendering fails
      }
    }
  }, [value]);

  const handleDownload = useCallback(() => {
    if (!value) return;
    try {
      // Render at high resolution for print quality (~300 DPI)
      const printCanvas = document.createElement("canvas");
      bwipjs.toCanvas(printCanvas, {
        ...getBwipOptions(value),
        scale: 6,
      });
      const a = document.createElement("a");
      a.download = `barcode-${value}.png`;
      a.href = printCanvas.toDataURL("image/png");
      a.click();
    } catch {
      // Fallback to screen-resolution canvas
      if (canvasRef.current) {
        const a = document.createElement("a");
        a.download = `barcode-${value}.png`;
        a.href = canvasRef.current.toDataURL("image/png");
        a.click();
      }
    }
  }, [value]);

  if (!value) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 overflow-hidden">
      {label && <h3 className="mb-3 text-sm font-medium text-foreground">{label}</h3>}
      <div className="flex flex-col items-center gap-3">
        <div className="w-full overflow-x-auto rounded-lg bg-white p-3">
          <div className="flex justify-center">
            <canvas ref={canvasRef} className="max-w-full" />
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="mr-2 size-4" />
          Descargar codigo de barras
        </Button>
      </div>
    </div>
  );
}
