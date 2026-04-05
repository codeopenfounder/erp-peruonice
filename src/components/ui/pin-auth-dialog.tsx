"use client";

import * as React from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { validateGerentePinAction } from "@/actions/pin-validation";

export interface PinAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onAuthorized: (info: { user_id: string; user_name: string }) => void | Promise<void>;
  isLoading?: boolean;
}

export function PinAuthDialog({
  open,
  onOpenChange,
  title,
  description,
  onAuthorized,
  isLoading = false,
}: PinAuthDialogProps) {
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [validating, setValidating] = React.useState(false);
  const [shake, setShake] = React.useState(false);
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const resetState = React.useCallback(() => {
    setPin("");
    setError(null);
    setValidating(false);
    setShake(false);
  }, []);

  React.useEffect(() => {
    if (open) {
      resetState();
      // Focus first input after dialog animation
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [open, resetState]);

  const handleValidate = React.useCallback(
    async (fullPin: string) => {
      setValidating(true);
      setError(null);
      try {
        const result = await validateGerentePinAction(fullPin);
        if (result.valid && result.user_id && result.user_name) {
          await onAuthorized({ user_id: result.user_id, user_name: result.user_name });
          onOpenChange(false);
        } else {
          setError(result.error ?? "PIN no autorizado");
          setShake(true);
          setTimeout(() => setShake(false), 500);
          setPin("");
          setTimeout(() => inputRefs.current[0]?.focus(), 100);
        }
      } catch {
        setError("Error al validar el PIN");
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setPin("");
      } finally {
        setValidating(false);
      }
    },
    [onAuthorized, onOpenChange]
  );

  const digits = pin.padEnd(4, "").slice(0, 4).split("");

  const handleChange = (index: number, char: string) => {
    if (validating || isLoading) return;
    const digit = char.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    const newPin = newDigits.join("").replace(/ /g, "");
    setPin(newPin);
    setError(null);

    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newPin.length === 4 && /^\d{4}$/.test(newPin)) {
      handleValidate(newPin);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index]?.trim() && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    if (validating || isLoading) return;
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    setPin(pasted);
    setError(null);
    const focusIdx = Math.min(pasted.length, 3);
    inputRefs.current[focusIdx]?.focus();

    if (pasted.length === 4 && /^\d{4}$/.test(pasted)) {
      handleValidate(pasted);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-destructive" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4 space-y-4">
          <div
            className={cn("flex gap-3 justify-center", shake && "animate-shake")}
            onPaste={handlePaste}
          >
            {[0, 1, 2, 3].map((i) => (
              <input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={digits[i]?.trim() || ""}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={validating || isLoading}
                className={cn(
                  "w-14 h-14 text-center text-2xl font-mono rounded-xl border-2 bg-background",
                  "outline-none transition-all duration-200",
                  "focus:ring-2 focus:ring-destructive/30 focus:border-destructive",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  error
                    ? "border-destructive/50"
                    : "border-border",
                )}
              />
            ))}
          </div>

          {validating && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Validando PIN...
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive text-center font-medium">
              {error}
            </p>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Ingresa el PIN de un gerente para autorizar esta acción
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={validating || isLoading}>
            Cancelar
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
