"use client";

import * as React from "react";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAdjustExpenseFund } from "@/hooks/queries/use-expense-fund";

interface AdjustFundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  register: {
    id: string;
    name: string;
    capital: number;
  } | null;
}

// ---------------------------------------------------------------------------
// PIN Input (4-digit OTP style)
// ---------------------------------------------------------------------------
function PinInput({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (pin: string) => void;
  error?: string;
}) {
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(4, "").slice(0, 4).split("");

  const handleChange = (index: number, char: string) => {
    const digit = char.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    const newPin = newDigits.join("").replace(/ /g, "");
    onChange(newPin);

    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index]?.trim() && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, 3);
    inputRefs.current[focusIdx]?.focus();
  };

  const isComplete = value.length === 4;
  const isValid = /^\d{4}$/.test(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label>PIN de gerente</Label>
        {isComplete && (
          <span className="flex items-center gap-1">
            {isValid ? (
              <Check className="size-3.5 text-emerald-400" />
            ) : (
              <X className="size-3.5 text-red-400" />
            )}
          </span>
        )}
      </div>
      <div className="flex gap-3 justify-center" onPaste={handlePaste}>
        {[0, 1, 2, 3].map((i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digits[i]?.trim() || ""}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className={cn(
              "w-14 h-14 text-center text-2xl font-mono rounded-xl border-2 bg-background",
              "outline-none transition-all duration-200",
              "focus:ring-2 focus:ring-primary/30 focus:border-primary",
              error
                ? "border-red-500/50"
                : isComplete && isValid
                  ? "border-emerald-500/50"
                  : "border-border",
            )}
          />
        ))}
      </div>
      {error && (
        <p className="text-sm text-red-400 text-center">{error}</p>
      )}
      <p className="text-xs text-muted-foreground text-center">
        Solo gerentes pueden autorizar ajustes
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------
export function AdjustFundDialog({
  open,
  onOpenChange,
  register,
}: AdjustFundDialogProps) {
  const mutation = useAdjustExpenseFund();
  const [newAmount, setNewAmount] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [pinError, setPinError] = React.useState<string | undefined>(undefined);

  // Reset form when dialog opens/closes
  React.useEffect(() => {
    if (open && register) {
      setNewAmount(register.capital.toString());
      setPin("");
      setPinError(undefined);
    }
  }, [open, register]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!register) return;

    // Validate PIN
    if (!/^\d{4}$/.test(pin)) {
      setPinError("PIN debe ser exactamente 4 dígitos");
      return;
    }

    setPinError(undefined);

    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error("El monto no puede ser negativo");
      return;
    }

    const result = await mutation.mutateAsync({
      cash_register_id: register.id,
      new_amount: amount,
      pin,
    });

    if (result.success) {
      toast.success("Fondo ajustado correctamente");
      onOpenChange(false);
    } else {
      const errorMsg = typeof result.error === "string" ? result.error : "Error al procesar";
      if (errorMsg.includes("PIN") || errorMsg.includes("gerente")) {
        setPinError(errorMsg);
      } else {
        toast.error(errorMsg);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar fondo de gastos</DialogTitle>
          <DialogDescription>
            Ajusta el capital mensual de la caja{" "}
            <span className="font-medium text-foreground">{register?.name}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Current capital */}
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <span className="text-sm text-muted-foreground">Capital actual</span>
            <span className="font-mono text-sm font-medium text-foreground">
              S/ {(register?.capital ?? 0).toFixed(2)}
            </span>
          </div>

          {/* New amount */}
          <div className="space-y-2">
            <Label htmlFor="new_amount">Nuevo capital mensual (S/)</Label>
            <Input
              id="new_amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
            />
          </div>

          {/* PIN Input */}
          <PinInput value={pin} onChange={setPin} error={pinError} />

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Aplicar ajuste
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
