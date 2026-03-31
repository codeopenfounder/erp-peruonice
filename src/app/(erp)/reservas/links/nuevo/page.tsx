"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Copy,
  ExternalLink,
  Link2,
  Plus,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { toast } from "sonner";

interface SchedulableProduct {
  id: string;
  name: string;
  sale_price: number;
}

interface AvailableSlot {
  slot_start: string;
  slot_end: string;
  available: number;
}

export default function NuevoLinkPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);

  // Step 0: Service & Branch
  const [branchId, setBranchId] = useState("");
  const [productId, setProductId] = useState("");
  const [products, setProducts] = useState<SchedulableProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Step 1: Date & Time
  const [reservationDate, setReservationDate] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Step 2: Customer
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerDocType, setCustomerDocType] = useState("");
  const [customerDocNumber, setCustomerDocNumber] = useState("");

  const { data: branches } = useBranchesForSelect();

  const selectedProduct = products.find((p) => p.id === productId);
  const totalAmount = selectedProduct
    ? selectedProduct.sale_price * quantity
    : 0;

  const todayStr = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Lima" })
  )
    .toISOString()
    .split("T")[0];

  // Load schedulable products when branch changes
  const handleBranchChange = async (id: string) => {
    setBranchId(id);
    setProductId("");
    setProducts([]);
    setLoadingProducts(true);
    try {
      const res = await fetch(
        `/api/culqi/products?branch_id=${id}`,
        { method: "GET" }
      );
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch {
      // Fallback: load from server action
    }
    setLoadingProducts(false);
  };

  // Load available slots when date changes
  const handleDateChange = async (date: string) => {
    setReservationDate(date);
    setSlotStart("");
    setSlotEnd("");
    setSlots([]);
    if (!productId || !branchId || !date) return;
    setLoadingSlots(true);
    try {
      const res = await fetch(
        `/api/culqi/slots?product_id=${productId}&branch_id=${branchId}&date=${date}`,
        { method: "GET" }
      );
      if (res.ok) {
        const data = await res.json();
        setSlots(data.slots || []);
      }
    } catch {
      // Slots API not available yet
    }
    setLoadingSlots(false);
  };

  const handleSlotSelect = (slot: AvailableSlot) => {
    setSlotStart(slot.slot_start);
    setSlotEnd(slot.slot_end);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/culqi/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          branch_id: branchId,
          reservation_date: reservationDate,
          slot_start: slotStart,
          slot_end: slotEnd,
          quantity,
          customer_name: customerName,
          customer_email: customerEmail || undefined,
          customer_phone: customerPhone || undefined,
          customer_document_type: customerDocType || undefined,
          customer_document_number: customerDocNumber || undefined,
        }),
      });

      const result = await res.json();

      if (result.success) {
        setResultUrl(result.data.culqi_link_url);
        setResultId(result.data.id);
        setStep(3); // Success step
        toast.success("Link de pago creado");
      } else {
        toast.error(result.error || "Error al crear link");
      }
    } catch (err) {
      toast.error("Error de conexion");
    } finally {
      setSubmitting(false);
    }
  };

  const STEPS = [
    { number: 0, label: "Servicio" },
    { number: 1, label: "Fecha" },
    { number: 2, label: "Cliente" },
    { number: 3, label: "Listo" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nuevo Link de Pago"
        description="Genera un link para que el cliente pague online"
        actions={
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 size-4" />
            Cancelar
          </Button>
        }
      />

      {/* Stepper */}
      <div className="flex items-center justify-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s.number} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex size-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  step === s.number
                    ? "bg-primary text-primary-foreground"
                    : step > s.number
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {step > s.number ? (
                  <Check className="size-3.5" />
                ) : (
                  s.number + 1
                )}
              </div>
              <span
                className={`text-[10px] mt-1 font-medium ${
                  step === s.number
                    ? "text-primary"
                    : step > s.number
                      ? "text-primary/60"
                      : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-12 mx-2 mb-4 ${
                  step > s.number ? "bg-primary/40" : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Steps */}
      <div className="max-w-xl mx-auto">
        <AnimatePresence mode="wait">
          {/* Step 0: Service & Branch */}
          {step === 0 && (
            <motion.div
              key="step-0"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Selecciona servicio y sede
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Sede
                    </label>
                    <Select value={branchId} onValueChange={handleBranchChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una sede..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(branches || []).map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Servicio
                    </label>
                    {loadingProducts ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="size-4 animate-spin" />
                        Cargando servicios...
                      </div>
                    ) : (
                      <Select
                        value={productId}
                        onValueChange={setProductId}
                        disabled={!branchId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un servicio..." />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} - S/ {p.sale_price.toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end mt-6">
                <Button
                  disabled={!productId || !branchId}
                  onClick={() => setStep(1)}
                >
                  Continuar
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 1: Date & Time */}
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Fecha, horario y cantidad
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Fecha de reserva
                    </label>
                    <Input
                      type="date"
                      min={todayStr}
                      value={reservationDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Hora inicio
                      </label>
                      <Input
                        type="time"
                        value={slotStart}
                        onChange={(e) => setSlotStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Hora fin
                      </label>
                      <Input
                        type="time"
                        value={slotEnd}
                        onChange={(e) => setSlotEnd(e.target.value)}
                      />
                    </div>
                  </div>

                  {slots.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Horarios disponibles
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {slots.map((s) => (
                          <button
                            key={`${s.slot_start}-${s.slot_end}`}
                            onClick={() => handleSlotSelect(s)}
                            className={`rounded-lg border px-3 py-2 text-xs font-mono transition-colors ${
                              slotStart === s.slot_start
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            {s.slot_start} - {s.slot_end}
                            <span className="block text-[10px] text-muted-foreground">
                              {s.available} disp.
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Cantidad de personas
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={quantity}
                      onChange={(e) =>
                        setQuantity(parseInt(e.target.value) || 1)
                      }
                    />
                  </div>

                  {selectedProduct && (
                    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total</span>
                        <span className="font-bold font-mono tabular-nums">
                          S/ {totalAmount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-between mt-6">
                <Button variant="outline" onClick={() => setStep(0)}>
                  <ArrowLeft className="mr-2 size-4" />
                  Volver
                </Button>
                <Button
                  disabled={!reservationDate || !slotStart}
                  onClick={() => setStep(2)}
                >
                  Continuar
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Customer info */}
          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Datos del cliente
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Nombre completo <span className="text-destructive">*</span>
                    </label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Juan Perez"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Telefono
                      </label>
                      <Input
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="999888777"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Email
                      </label>
                      <Input
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="cliente@email.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Tipo documento
                      </label>
                      <Select
                        value={customerDocType}
                        onValueChange={setCustomerDocType}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Opcional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dni">DNI</SelectItem>
                          <SelectItem value="ce">C.E.</SelectItem>
                          <SelectItem value="passport">Pasaporte</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Numero documento
                      </label>
                      <Input
                        value={customerDocNumber}
                        onChange={(e) =>
                          setCustomerDocNumber(e.target.value)
                        }
                        placeholder="12345678"
                      />
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-1 mt-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Servicio</span>
                      <span>{selectedProduct?.name}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Fecha</span>
                      <span className="font-mono">
                        {reservationDate} {slotStart}-{slotEnd}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Cantidad</span>
                      <span>{quantity}</span>
                    </div>
                    <div className="border-t border-border pt-1 mt-1 flex justify-between text-sm font-medium">
                      <span>Total</span>
                      <span className="font-mono tabular-nums">
                        S/ {totalAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between mt-6">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 size-4" />
                  Volver
                </Button>
                <Button
                  disabled={!customerName.trim() || submitting}
                  onClick={handleSubmit}
                  className="min-w-[160px]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <Link2 className="mr-2 size-4" />
                      Generar Link
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="border-success/30 bg-success/5">
                <CardContent className="p-8 text-center space-y-4">
                  <div className="flex justify-center">
                    <div className="flex size-16 items-center justify-center rounded-full bg-success/10">
                      <Check className="size-8 text-success" />
                    </div>
                  </div>
                  <h2 className="text-lg font-bold">
                    Link de pago generado
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Comparte este link con el cliente para que realice el pago
                  </p>

                  {resultUrl ? (
                    <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-2">
                      <input
                        readOnly
                        value={resultUrl}
                        className="flex-1 bg-transparent text-sm font-mono outline-none"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => {
                          navigator.clipboard.writeText(resultUrl);
                          toast.success("Link copiado");
                        }}
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        asChild
                      >
                        <a
                          href={resultUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="size-4" />
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-500">
                      Link creado sin URL de Culqi (API key no configurada).
                      Configure CULQI_SECRET_KEY en las variables de entorno.
                    </p>
                  )}

                  <div className="flex justify-center gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => router.push("/reservas/links")}
                    >
                      Ver todos los links
                    </Button>
                    <Button
                      onClick={() => {
                        setStep(0);
                        setResultUrl(null);
                        setResultId(null);
                        setCustomerName("");
                        setCustomerPhone("");
                        setCustomerEmail("");
                        setCustomerDocType("");
                        setCustomerDocNumber("");
                      }}
                    >
                      <Plus className="mr-2 size-4" />
                      Crear otro link
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
