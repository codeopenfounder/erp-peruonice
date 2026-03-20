"use client";

import * as React from "react";
import {
  Loader2,
  Crown,
  Eye,
  Monitor,
  ScanLine,
  ArrowLeft,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useCreateUser } from "@/hooks/queries/use-users";
import {
  CARGO_OPTIONS,
  type Cargo,
  type CreateUserInput,
} from "@/lib/validators/user";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Cargo card definitions
// ---------------------------------------------------------------------------
const CARGO_CARDS: {
  value: Cargo;
  label: string;
  description: string;
  icon: React.ElementType;
  accent: string;
  border: string;
  bg: string;
}[] = [
  {
    value: "gerente",
    label: "Gerente",
    description: "Acceso completo al sistema web y punto de venta",
    icon: Crown,
    accent: "text-blue-400",
    border: "border-blue-500/50",
    bg: "bg-blue-500/10",
  },
  {
    value: "supervisor",
    label: "Supervisor",
    description: "Acceso al sistema web y punto de venta",
    icon: Eye,
    accent: "text-emerald-400",
    border: "border-emerald-500/50",
    bg: "bg-emerald-500/10",
  },
  {
    value: "cajero",
    label: "Cajero",
    description: "Solo acceso al punto de venta (POI Fact)",
    icon: Monitor,
    accent: "text-amber-400",
    border: "border-amber-500/50",
    bg: "bg-amber-500/10",
  },
  {
    value: "control_acceso",
    label: "Control de Acceso",
    description: "Solo acceso a POI Lector (control de ingreso)",
    icon: ScanLine,
    accent: "text-violet-400",
    border: "border-violet-500/50",
    bg: "bg-violet-500/10",
  },
];

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
    // Only allow digits
    const digit = char.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    const newPin = newDigits.join("").replace(/ /g, "");
    onChange(newPin);

    // Auto-focus next
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
        <Label>PIN de acceso</Label>
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
        4 digitos numericos, unico por usuario
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------
interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps) {
  const createMutation = useCreateUser();

  // Step 1 = cargo selection, Step 2 = form fields
  const [step, setStep] = React.useState<1 | 2>(1);
  const [cargo, setCargo] = React.useState<Cargo | null>(null);

  // Form fields
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pinCode, setPinCode] = React.useState("");

  // Validation errors
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setStep(1);
      setCargo(null);
      setFirstName("");
      setLastName("");
      setEmail("");
      setPassword("");
      setPinCode("");
      setErrors({});
    }
  }, [open]);

  const needsWebFields = cargo === "gerente" || cargo === "supervisor";

  const handleCargoSelect = (c: Cargo) => {
    setCargo(c);
    setStep(2);
    setErrors({});
  };

  const handleBack = () => {
    setStep(1);
    setErrors({});
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.first_name = "Nombre requerido";
    if (!lastName.trim()) errs.last_name = "Apellido requerido";
    if (needsWebFields) {
      if (!email.trim()) errs.email = "Email requerido";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Email invalido";
      if (!password) errs.password = "Contrasena requerida";
      else if (password.length < 6) errs.password = "Minimo 6 caracteres";
    }
    if (!/^\d{4}$/.test(pinCode)) errs.pin_code = "PIN debe ser exactamente 4 digitos";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!cargo) return;
    if (!validate()) return;

    const payload: Record<string, unknown> = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      cargo,
      pin_code: pinCode,
    };

    if (needsWebFields) {
      payload.email = email.trim();
      payload.password = password;
    }

    try {
      const result = await createMutation.mutateAsync(payload as CreateUserInput);
      if (result.success) {
        toast.success("Usuario creado correctamente");
        onOpenChange(false);
      } else {
        const msg =
          typeof result.error === "string"
            ? result.error
            : "Error al crear el usuario";
        toast.error(msg);
      }
    } catch {
      toast.error("Error al crear el usuario");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("overflow-hidden", step === 1 ? "max-w-lg" : "max-w-md")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 2 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 -ml-1"
                onClick={handleBack}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            {step === 1 ? "Nuevo Usuario" : `Nuevo ${CARGO_CARDS.find((c) => c.value === cargo)?.label}`}
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              <p className="text-sm text-muted-foreground">
                Selecciona el tipo de usuario que deseas crear
              </p>

              <div className="grid gap-3">
                {CARGO_CARDS.map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.value}
                      type="button"
                      onClick={() => handleCargoSelect(card.value)}
                      className={cn(
                        "flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all duration-200",
                        "hover:shadow-md hover:scale-[1.01]",
                        "border-border/50 hover:" + card.border,
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-11 items-center justify-center rounded-lg",
                          card.bg,
                        )}
                      >
                        <Icon className={cn("size-5", card.accent)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{card.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {card.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {step === 2 && cargo && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Name fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input
                    placeholder="Juan"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={errors.first_name ? "border-red-500/50" : ""}
                  />
                  {errors.first_name && (
                    <p className="text-xs text-red-400">{errors.first_name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Apellido</Label>
                  <Input
                    placeholder="Perez"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={errors.last_name ? "border-red-500/50" : ""}
                  />
                  {errors.last_name && (
                    <p className="text-xs text-red-400">{errors.last_name}</p>
                  )}
                </div>
              </div>

              {/* Email + Password (gerente / supervisor only) */}
              {needsWebFields && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      placeholder="usuario@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={errors.email ? "border-red-500/50" : ""}
                    />
                    {errors.email && (
                      <p className="text-xs text-red-400">{errors.email}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Contrasena</Label>
                    <Input
                      type="password"
                      placeholder="Minimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={errors.password ? "border-red-500/50" : ""}
                    />
                    {errors.password && (
                      <p className="text-xs text-red-400">{errors.password}</p>
                    )}
                  </div>
                </motion.div>
              )}

              {/* PIN */}
              <PinInput
                value={pinCode}
                onChange={setPinCode}
                error={errors.pin_code}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={createMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Crear Usuario
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
