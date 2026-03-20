"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addSupplyStockSchema } from "@/lib/validators/supply";
import { useAddSupplyStock } from "@/hooks/queries/use-supplies";
import { DECIMAL_UNITS } from "@/lib/constants/sunat";

type AddSupplyStockForm = {
  quantity: number;
  supplier_ruc: string;
  invoice_code: string;
  notes: string;
};

interface AddSupplyStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplyId: string;
  supplyName: string;
  unitOfMeasure?: string;
}

export function AddSupplyStockDialog({
  open,
  onOpenChange,
  supplyId,
  supplyName,
  unitOfMeasure,
}: AddSupplyStockDialogProps) {
  const allowDecimals = unitOfMeasure ? DECIMAL_UNITS.has(unitOfMeasure) : false;
  const addStockMutation = useAddSupplyStock();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddSupplyStockForm>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(addSupplyStockSchema) as any,
    defaultValues: {
      quantity: 1,
      supplier_ruc: "",
      invoice_code: "",
      notes: "",
    },
  });

  const onSubmit = async (data: AddSupplyStockForm) => {
    const result = await addStockMutation.mutateAsync({
      supplyId,
      data,
    });

    if (result.success) {
      toast.success(result.message || "Stock actualizado");
      reset();
      onOpenChange(false);
    } else {
      toast.error(
        typeof result.error === "string" ? result.error : "Error al agregar stock"
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Anadir stock de insumo</DialogTitle>
          <DialogDescription>
            Agrega unidades a &quot;{supplyName}&quot;. Se registrara
            
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stock-quantity">Cantidad a agregar *</Label>
            <Input
              id="stock-quantity"
              type="number"
              min={allowDecimals ? "0.001" : "1"}
              step={allowDecimals ? "any" : "1"}
              {...register("quantity")}
            />
            {errors.quantity && (
              <p className="text-xs text-destructive">
                {errors.quantity.message}
              </p>
            )}
          </div>

          <div
            className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3"
            style={{
              animation: "confirm-section-in 0.3s ease-out both",
            }}
          >
            <p className="text-sm font-medium text-muted-foreground">
              Datos de factura de compra
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supplier-ruc">RUC del proveedor *</Label>
                <Input
                  id="supplier-ruc"
                  placeholder="20123456789"
                  maxLength={11}
                  {...register("supplier_ruc")}
                />
                {errors.supplier_ruc && (
                  <p className="text-xs text-destructive">
                    {errors.supplier_ruc.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice-code">Codigo de factura *</Label>
                <Input
                  id="invoice-code"
                  placeholder="F001-00001234"
                  {...register("invoice_code")}
                />
                {errors.invoice_code && (
                  <p className="text-xs text-destructive">
                    {errors.invoice_code.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stock-notes">Notas</Label>
            <Textarea
              id="stock-notes"
              placeholder="Notas opcionales..."
              rows={2}
              {...register("notes")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={addStockMutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={addStockMutation.isPending}>
              {addStockMutation.isPending ? "Enviando..." : "Solicitar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
