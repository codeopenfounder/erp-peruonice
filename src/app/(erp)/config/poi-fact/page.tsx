"use client";

import * as React from "react";
import {
  Receipt,
  Settings,
  Save,
  Loader2,
  Trash2,
  MoreHorizontal,
  CreditCard,
  Plus,
  UserCheck,
  Pencil,
  Download,
  Monitor,
  Wifi,
  Key,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useFactConfig,
  useSaveFactConfig,
  useInvoiceSeries,
  useCashRegisters,
  useDeleteInvoiceSeries,
  useDeleteCashRegister,
  useCreateCashRegister,
  useCreateInvoiceSeries,
  useUpdateInvoiceSeries,
  useFactUsers,
  useCreateFactUser,
  useUpdateFactUser,
  useDeleteFactUser,
  useEmployeesForFactAssignment,
} from "@/hooks/queries/use-fact-config";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { verifyFactToken } from "@/actions/fact-config";
import type { TokenVerification } from "@/lib/sunat/verify";

// ---------------------------------------------------------------------------
// Config Form (RUC, razon social, provider, etc.)
// ---------------------------------------------------------------------------
function FactConfigForm() {
  const { data: config, isLoading } = useFactConfig();
  const saveMutation = useSaveFactConfig();

  const [formData, setFormData] = React.useState({
    ruc: "",
    razon_social: "",
    direccion_fiscal: "",
    ubigeo: "",
    departamento: "",
    provincia: "",
    distrito: "",
    provider: "apisunat",
    api_token: "",
    is_production: false,
    detraction_account: "",
  });

  const [tokenCheck, setTokenCheck] = React.useState<TokenVerification | null>(null);
  const [isVerifying, setIsVerifying] = React.useState(false);

  React.useEffect(() => {
    if (config) {
      setFormData({
        ruc: config.ruc || "",
        razon_social: config.razon_social || "",
        direccion_fiscal: config.direccion_fiscal || "",
        ubigeo: config.ubigeo || "",
        departamento: config.departamento || "",
        provincia: config.provincia || "",
        distrito: config.distrito || "",
        provider: config.provider || "apisunat",
        api_token: config.api_token || "",
        is_production: config.is_production || false,
        detraction_account: (config as { detraction_account?: string }).detraction_account || "",
      });
    }
  }, [config]);

  const handleVerifyToken = async () => {
    setIsVerifying(true);
    setTokenCheck(null);
    try {
      const res = await verifyFactToken({
        provider: formData.provider,
        api_token: formData.api_token,
        ruc: formData.ruc,
      });
      if (res.success) {
        setTokenCheck(res.data);
      } else {
        toast.error(typeof res.error === "string" ? res.error : "No se pudo verificar el token");
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = async () => {
    const result = await saveMutation.mutateAsync(formData);
    if (result.success) {
      toast.success("Configuracion guardada");
    } else {
      const msg = typeof result.error === "string" ? result.error : "Error al guardar";
      toast.error(msg);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Business info */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Datos de la empresa
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>RUC</Label>
            <Input
              value={formData.ruc}
              onChange={(e) => setFormData((f) => ({ ...f, ruc: e.target.value }))}
              placeholder="20100000001"
              maxLength={11}
            />
          </div>
          <div className="space-y-2">
            <Label>Razon Social</Label>
            <Input
              value={formData.razon_social}
              onChange={(e) => setFormData((f) => ({ ...f, razon_social: e.target.value }))}
              placeholder="Mi Empresa S.A.C."
            />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Label>Direccion Fiscal</Label>
          <Input
            value={formData.direccion_fiscal}
            onChange={(e) => setFormData((f) => ({ ...f, direccion_fiscal: e.target.value }))}
            placeholder="Av. Principal 123, Lima"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 sm:grid-cols-4">
          <div className="space-y-2">
            <Label>Departamento</Label>
            <Input
              value={formData.departamento}
              onChange={(e) => setFormData((f) => ({ ...f, departamento: e.target.value }))}
              placeholder="Lima"
            />
          </div>
          <div className="space-y-2">
            <Label>Provincia</Label>
            <Input
              value={formData.provincia}
              onChange={(e) => setFormData((f) => ({ ...f, provincia: e.target.value }))}
              placeholder="Lima"
            />
          </div>
          <div className="space-y-2">
            <Label>Distrito</Label>
            <Input
              value={formData.distrito}
              onChange={(e) => setFormData((f) => ({ ...f, distrito: e.target.value }))}
              placeholder="Miraflores"
            />
          </div>
          <div className="space-y-2">
            <Label>Ubigeo</Label>
            <Input
              value={formData.ubigeo}
              onChange={(e) =>
                setFormData((f) => ({ ...f, ubigeo: e.target.value.replace(/\D/g, "") }))
              }
              placeholder="150130"
              maxLength={6}
              inputMode="numeric"
            />
            <p className="text-xs text-muted-foreground">
              Código INEI de 6 dígitos del distrito fiscal. Bilme lo exige.
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Provider */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Proveedor de facturacion electronica
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Proveedor</Label>
            <Select
              value={formData.provider}
              onValueChange={(v) =>
                setFormData((f) => ({ ...f, provider: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona proveedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="apisunat">API Sunat (apisunat.pe)</SelectItem>
                <SelectItem value="bilme">Bilme (billmeperu.com)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formData.provider === "bilme"
                ? "Token de empresa Bilme. XML/CDR se almacenan en Supabase."
                : "Token Bearer de apisunat.pe. XML/CDR servidos por el proveedor."}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Token API</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={formData.api_token}
                onChange={(e) => {
                  setTokenCheck(null);
                  setFormData((f) => ({ ...f, api_token: e.target.value }));
                }}
                placeholder={
                  formData.provider === "bilme"
                    ? "Token de empresa Bilme"
                    : "Token de acceso apisunat"
                }
              />
              {formData.provider === "bilme" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleVerifyToken}
                  disabled={isVerifying || !formData.api_token}
                >
                  {isVerifying ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Verificar"
                  )}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Cambiar de proveedor solo afecta nuevos comprobantes. Los anteriores conservan sus URLs originales.
            </p>
          </div>
        </div>

        {tokenCheck && (
          <div
            className={`mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${
              !tokenCheck.valid
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : tokenCheck.environment === "production"
                  ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                  : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-500"
            }`}
          >
            {tokenCheck.valid ? (
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            ) : (
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            )}
            <span>{tokenCheck.message}</span>
          </div>
        )}

        <div className="flex items-center gap-3 mt-4">
          <Switch
            checked={formData.is_production}
            onCheckedChange={(checked) => {
              setTokenCheck(null);
              setFormData((f) => ({ ...f, is_production: checked }));
            }}
          />
          <div>
            <Label>Modo Produccion</Label>
            <p className="text-xs text-muted-foreground">
              {formData.provider === "bilme"
                ? "En Bilme el ambiente lo define el token: la empresa se registra en su panel como \"Desarrollo\" o \"Producción\". Este interruptor solo declara cuál esperas; al guardar se comprueba que coincida."
                : formData.is_production
                  ? "Documentos se enviaran a SUNAT en modo produccion"
                  : "Documentos se enviaran en modo de pruebas (beta)"}
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Detraccion (SPOT) */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Detracción (SPOT)
        </p>
        <div className="space-y-2">
          <Label>Cuenta del Banco de la Nación</Label>
          <Input
            value={formData.detraction_account}
            onChange={(e) =>
              setFormData((f) => ({ ...f, detraction_account: e.target.value }))
            }
            placeholder="00001234567 o 0004-3342343243"
            maxLength={30}
          />
          <p className="text-xs text-muted-foreground">
            Cuenta del emisor donde el cliente depositará la detracción de las facturas sujetas al SPOT. Solo números y guiones.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          Guardar Configuracion
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document type labels
// ---------------------------------------------------------------------------
// Las notas llevan serie propia para que su correlativo sea independiente del
// del comprobante que modifican. SUNAT exige que la serie empiece con "B" si
// modifica una boleta y con "F" si modifica una factura (Anexo N.° 3 de la
// RS 097-2012, sust. por RS 114-2019).
const DOCUMENT_TYPES = [
  { value: "boleta", label: "Boleta" },
  { value: "factura", label: "Factura" },
  { value: "nota_credito_boleta", label: "Nota de crédito de boleta" },
  { value: "nota_credito_factura", label: "Nota de crédito de factura" },
  { value: "nota_debito_boleta", label: "Nota de débito de boleta" },
  { value: "nota_debito_factura", label: "Nota de débito de factura" },
];

const DOCUMENT_TYPE_SHORT: Record<string, string> = {
  boleta: "Boleta",
  factura: "Factura",
  nota_credito_boleta: "NC boleta",
  nota_credito_factura: "NC factura",
  nota_debito_boleta: "ND boleta",
  nota_debito_factura: "ND factura",
};

// ---------------------------------------------------------------------------
// Create Cash Register Dialog
// ---------------------------------------------------------------------------
function CreateCashRegisterDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createMutation = useCreateCashRegister();
  const { data: branches } = useBranchesForSelect();

  const [name, setName] = React.useState("");
  const [branchId, setBranchId] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setName("");
      setBranchId("");
    }
  }, [open]);

  const handleSubmit = async () => {
    if (name.trim().length < 2) {
      toast.error("El nombre debe tener al menos 2 caracteres");
      return;
    }
    if (!branchId) {
      toast.error("Debe seleccionar una sede");
      return;
    }
    try {
      const result = await createMutation.mutateAsync({ name: name.trim(), branch_id: branchId });
      if (result.success) {
        // La caja nace con sus series propias (B00n/F00n). Si eso falla la caja
        // igual existe, pero emitiría sobre la serie de otra: hay que verlo.
        if ("warning" in result && result.warning) {
          toast.warning(result.warning, { duration: 12000 });
        } else {
          toast.success("Caja creada con sus series de boleta y factura");
        }
        onOpenChange(false);
      } else {
        const msg = typeof result.error === "string" ? result.error : "Error al crear la caja";
        toast.error(msg);
      }
    } catch {
      toast.error("Error al crear la caja");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva Caja Registradora</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Caja 1"
            />
          </div>
          <div className="space-y-2">
            <Label>Sede</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar sede" />
              </SelectTrigger>
              <SelectContent>
                {(branches ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Crear Caja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Create Invoice Series Dialog
// ---------------------------------------------------------------------------
function CreateSeriesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createMutation = useCreateInvoiceSeries();
  const { data: branches } = useBranchesForSelect();
  const { data: registers } = useCashRegisters();

  const [seriesCode, setSeriesCode] = React.useState("");
  const [documentType, setDocumentType] = React.useState("");
  const [branchId, setBranchId] = React.useState("");
  const [cashRegisterId, setCashRegisterId] = React.useState("");

  // Filter registers by selected branch
  const filteredRegisters = React.useMemo(() => {
    if (!branchId || !registers) return [];
    return registers.filter((r) => r.branch_id === branchId);
  }, [branchId, registers]);

  React.useEffect(() => {
    if (open) {
      setSeriesCode("");
      setDocumentType("");
      setBranchId("");
      setCashRegisterId("");
    }
  }, [open]);

  // Reset cash register when branch changes
  React.useEffect(() => {
    setCashRegisterId("");
  }, [branchId]);

  const handleSubmit = async () => {
    // SUNAT admite 4 alfanuméricos, no sólo letra + 3 dígitos. Con la regla
    // anterior el cliente rechazaba FC01/BD01 —las series de notas— aunque el
    // servidor (invoiceSeriesSchema) sí las aceptaba, así que sólo existían
    // porque las creó una migración.
    if (!/^[A-Z][A-Z0-9]{3}$/.test(seriesCode)) {
      toast.error("Formato de serie: letra + 3 alfanuméricos (ej: F001, B002, FC01)");
      return;
    }
    const expectedPrefix = documentType.includes("factura") ? "F" : "B";
    if (documentType && !seriesCode.startsWith(expectedPrefix)) {
      toast.error(
        `SUNAT exige que la serie empiece con "${expectedPrefix}" para este tipo de documento`,
      );
      return;
    }
    if (!documentType) {
      toast.error("Debe seleccionar un tipo de documento");
      return;
    }
    if (!branchId) {
      toast.error("Debe seleccionar una sede");
      return;
    }
    if (!cashRegisterId) {
      toast.error("Debe seleccionar una caja");
      return;
    }
    try {
      // branch_id no viaja: el servidor lo deriva de la caja elegida. La sede de
      // una serie es la de su caja, y mandarla por separado era justamente lo
      // que dejaba invoice_series.branch_id en NULL (Zod la descartaba).
      const payload: Record<string, unknown> = {
        series_code: seriesCode,
        document_type: documentType,
        cash_register_id: cashRegisterId,
      };
      const result = await createMutation.mutateAsync(payload);
      if (result.success) {
        toast.success("Serie creada exitosamente");
        onOpenChange(false);
      } else {
        const msg = typeof result.error === "string" ? result.error : "Error al crear la serie";
        toast.error(msg);
      }
    } catch {
      toast.error("Error al crear la serie");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva Serie de Documento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Código de serie</Label>
              <Input
                value={seriesCode}
                onChange={(e) => setSeriesCode(e.target.value.toUpperCase())}
                placeholder="B001"
                maxLength={4}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Letra + 3 alfanuméricos. F para facturas y sus notas, B para boletas y las suyas.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Tipo de documento</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((dt) => (
                    <SelectItem key={dt.value} value={dt.value}>
                      {dt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Sede</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar sede" />
              </SelectTrigger>
              <SelectContent>
                {(branches ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Caja registradora</Label>
            <Select value={cashRegisterId} onValueChange={setCashRegisterId} disabled={!branchId}>
              <SelectTrigger>
                <SelectValue placeholder={branchId ? "Seleccionar caja" : "Seleccione una sede primero"} />
              </SelectTrigger>
              <SelectContent>
                {filteredRegisters.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} ({r.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Crear Serie
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reassign Series Dialog
// ---------------------------------------------------------------------------
// Antes no existía: useUpdateInvoiceSeries estaba definido pero sin un solo
// consumidor, así que mover una serie a otra caja obligaba a borrarla y
// recrearla —lo que reinicia el correlativo a 0 y produce comprobantes con
// números ya usados, rechazo 0402 de SUNAT—.
function ReassignSeriesDialog({
  series,
  onOpenChange,
}: {
  series: { id: string; series_code: string; cash_register_id: string | null } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const updateMutation = useUpdateInvoiceSeries();
  const { data: registers } = useCashRegisters();
  const [cashRegisterId, setCashRegisterId] = React.useState("");

  React.useEffect(() => {
    setCashRegisterId(series?.cash_register_id ?? "");
  }, [series]);

  const handleSubmit = async () => {
    if (!series) return;
    if (!cashRegisterId) {
      toast.error("Debe seleccionar una caja");
      return;
    }
    try {
      const result = await updateMutation.mutateAsync({
        id: series.id,
        data: { cash_register_id: cashRegisterId },
      });
      if (result.success) {
        toast.success(`Serie ${series.series_code} reasignada`);
        onOpenChange(false);
      } else {
        const msg = typeof result.error === "string" ? result.error : "Error al reasignar la serie";
        toast.error(msg);
      }
    } catch {
      toast.error("Error al reasignar la serie");
    }
  };

  return (
    <Dialog open={!!series} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reasignar serie {series?.series_code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Caja registradora</Label>
            <Select value={cashRegisterId} onValueChange={setCashRegisterId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar caja" />
              </SelectTrigger>
              <SelectContent>
                {(registers ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} ({r.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              El correlativo no se toca: reasignar no reinicia la numeración. La sede se
              actualiza sola a la de la caja elegida.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateMutation.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
            {updateMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Reasignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Series Table
// ---------------------------------------------------------------------------
function SeriesTab() {
  const { data: series, isLoading } = useInvoiceSeries();
  const { data: registers } = useCashRegisters();
  const deleteMutation = useDeleteInvoiceSeries();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [reassigning, setReassigning] = React.useState<{
    id: string;
    series_code: string;
    cash_register_id: string | null;
  } | null>(null);

  // Cajas activas sin serie propia de boleta o de factura.
  //
  // Importa porque el POS resuelve la serie con `find(tipo && caja) ||
  // find(tipo)`: una caja sin serie propia no falla, emite silenciosamente sobre
  // la serie de otra caja. Dos terminales compartiendo contador es exactamente
  // cómo el número impreso en el ticket deja de ser el del comprobante real.
  const registersWithoutSeries = React.useMemo(() => {
    if (!registers || !series) return [];
    return registers
      .filter((r) => r.is_active)
      .map((r) => {
        const own = series.filter((s) => s.cash_register_id === r.id && s.is_active);
        const missing = (["boleta", "factura"] as const).filter(
          (t) => !own.some((s) => s.document_type === t),
        );
        return { register: r, missing: missing as string[] };
      })
      .filter((x) => x.missing.length > 0);
  }, [registers, series]);

  const handleDelete = async (id: string) => {
    const result = await deleteMutation.mutateAsync(id);
    if (result.success) {
      toast.success("Serie eliminada");
    } else {
      toast.error("error" in result && typeof result.error === "string" ? result.error : "Error");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!series || series.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" />
            Nueva serie
          </Button>
        </div>
        <EmptyState
          icon={Receipt}
          title="Sin series de documentos"
          description="Configure las series para emitir facturas y boletas desde POI Fact"
        />
        <CreateSeriesDialog open={createOpen} onOpenChange={setCreateOpen} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {registersWithoutSeries.length > 0 && (
        <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-amber-500">Cajas activas sin serie propia</p>
            {registersWithoutSeries.map(({ register, missing }) => (
              <p key={register.id} className="text-muted-foreground">
                <span className="font-medium">{register.name}</span> ({register.code}) no tiene
                serie de {missing.join(" ni de ")}.
              </p>
            ))}
            <p className="text-muted-foreground">
              Mientras falte, esa caja emite sobre la serie de otra: comparten correlativo y el
              número impreso en el ticket puede no ser el del comprobante real.
            </p>
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          Nueva serie
        </Button>
      </div>
      <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Correlativo</TableHead>
            <TableHead>Caja</TableHead>
            <TableHead>Sede</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {series.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-sm">{s.series_code}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {DOCUMENT_TYPE_SHORT[s.document_type] ?? s.document_type}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">{s.current_correlative}</TableCell>
                <TableCell className="text-sm">
                  {s.cash_register_name || <span className="text-muted-foreground italic">-</span>}
                </TableCell>
                <TableCell className="text-sm">
                  {s.branch_name || <span className="text-muted-foreground italic">-</span>}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={s.is_active ? "default" : "secondary"}
                    className={
                      s.is_active
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-red-500/15 text-red-400 border-red-500/30"
                    }
                  >
                    {s.is_active ? "Activa" : "Inactiva"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          setReassigning({
                            id: s.id,
                            series_code: s.series_code,
                            cash_register_id: s.cash_register_id ?? null,
                          })
                        }
                      >
                        <Pencil className="mr-2 size-4" />
                        Reasignar caja
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(s.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 size-4" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
      <CreateSeriesDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ReassignSeriesDialog
        series={reassigning}
        onOpenChange={(open) => !open && setReassigning(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cash Registers Table
// ---------------------------------------------------------------------------
function CashRegistersTab() {
  const { data: registers, isLoading } = useCashRegisters();
  const deleteMutation = useDeleteCashRegister();
  const [createOpen, setCreateOpen] = React.useState(false);

  const handleDelete = async (id: string) => {
    const result = await deleteMutation.mutateAsync(id);
    if (result.success) {
      toast.success("Caja eliminada");
    } else {
      toast.error("error" in result && typeof result.error === "string" ? result.error : "Error");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!registers || registers.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" />
            Nueva caja
          </Button>
        </div>
        <EmptyState
          icon={CreditCard}
          title="Sin cajas registradoras"
          description="Cree cajas registradoras para administrar las ventas en POI Fact"
        />
        <CreateCashRegisterDialog open={createOpen} onOpenChange={setCreateOpen} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          Nueva caja
        </Button>
      </div>
      <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Sede</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {registers.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.code}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-sm">
                  {r.branch_name || <span className="text-muted-foreground italic">-</span>}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={r.is_active ? "default" : "secondary"}
                    className={
                      r.is_active
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-red-500/15 text-red-400 border-red-500/30"
                    }
                  >
                    {r.is_active ? "Activa" : "Inactiva"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleDelete(r.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 size-4" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
      <CreateCashRegisterDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assign Cajero Dialog
// ---------------------------------------------------------------------------
function AssignCajeroDialog({
  open,
  onOpenChange,
  editData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: { id: string; cash_register_id: string } | null;
}) {
  const createMutation = useCreateFactUser();
  const updateMutation = useUpdateFactUser();
  const { data: employees } = useEmployeesForFactAssignment();
  const { data: registers } = useCashRegisters();

  const [userId, setUserId] = React.useState("");
  const [cashRegisterId, setCashRegisterId] = React.useState("");

  const isEditing = !!editData;
  const activeRegisters = React.useMemo(
    () => (registers ?? []).filter((r: any) => r.is_active),
    [registers],
  );

  React.useEffect(() => {
    if (open) {
      if (editData) {
        setCashRegisterId(editData.cash_register_id || "");
        setUserId("");
      } else {
        setUserId("");
        setCashRegisterId("");
      }
    }
  }, [open, editData]);

  const handleSubmit = async () => {
    if (!isEditing && !userId) {
      toast.error("Debe seleccionar un empleado");
      return;
    }
    if (!cashRegisterId) {
      toast.error("Debe seleccionar una caja");
      return;
    }

    try {
      if (isEditing) {
        const result = await updateMutation.mutateAsync({
          id: editData!.id,
          data: { cash_register_id: cashRegisterId },
        });
        if (result.success) {
          toast.success("Asignacion actualizada");
          onOpenChange(false);
        } else {
          toast.error(typeof result.error === "string" ? result.error : "Error al actualizar");
        }
      } else {
        const result = await createMutation.mutateAsync({
          user_id: userId,
          cash_register_id: cashRegisterId,
        });
        if (result.success) {
          toast.success("Cajero asignado exitosamente");
          onOpenChange(false);
        } else {
          toast.error(typeof result.error === "string" ? result.error : "Error al asignar");
        }
      }
    } catch {
      toast.error("Error al guardar la asignacion");
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Cambiar Caja" : "Asignar Cajero a Caja"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!isEditing && (
            <div className="space-y-2">
              <Label>Empleado</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar empleado" />
                </SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map((e: any) => (
                    <SelectItem key={e.user_id} value={e.user_id}>
                      {e.employee_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {employees && employees.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Todos los empleados ya tienen caja asignada. Cree nuevos usuarios en Configuracion → Usuarios.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Caja Registradora</Label>
            <Select value={cashRegisterId} onValueChange={setCashRegisterId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar caja" />
              </SelectTrigger>
              <SelectContent>
                {activeRegisters.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} ({r.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isEditing ? "Guardar" : "Asignar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Cajeros Tab
// ---------------------------------------------------------------------------
function CajerosTab() {
  const { data: factUsers, isLoading } = useFactUsers();
  const deleteMutation = useDeleteFactUser();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editData, setEditData] = React.useState<{
    id: string;
    cash_register_id: string;
  } | null>(null);

  const handleDelete = async (id: string) => {
    const result = await deleteMutation.mutateAsync(id);
    if (result.success) {
      toast.success("Asignacion eliminada");
    } else {
      toast.error("error" in result && typeof result.error === "string" ? result.error : "Error");
    }
  };

  const handleEdit = (item: any) => {
    setEditData({
      id: item.id,
      cash_register_id: item.cash_register_id || "",
    });
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditData(null);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!factUsers || factUsers.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={handleCreate}>
            <Plus className="mr-2 size-4" />
            Asignar cajero
          </Button>
        </div>
        <EmptyState
          icon={UserCheck}
          title="Sin cajeros asignados"
          description="Asigne empleados a cajas registradoras para que puedan usar POI Fact"
        />
        <AssignCajeroDialog open={dialogOpen} onOpenChange={setDialogOpen} editData={editData} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={handleCreate}>
          <Plus className="mr-2 size-4" />
          Asignar cajero
        </Button>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empleado</TableHead>
              <TableHead>Caja</TableHead>
              <TableHead>PIN</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {factUsers.map((fu: any) => (
              <TableRow key={fu.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{fu.user_name || fu.user_email}</p>
                    {fu.user_name && fu.user_email && !fu.user_email.endsWith("@poi.internal") && (
                      <p className="text-xs text-muted-foreground">{fu.user_email}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {fu.cash_register_name || (
                    <span className="text-muted-foreground italic">Sin caja</span>
                  )}
                </TableCell>
                <TableCell>
                  {fu.pin_code ? (
                    <span className="font-mono text-sm tracking-wider">••••</span>
                  ) : (
                    <span className="text-muted-foreground italic text-xs">Sin PIN</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={fu.is_active ? "default" : "secondary"}
                    className={
                      fu.is_active
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-red-500/15 text-red-400 border-red-500/30"
                    }
                  >
                    {fu.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(fu)}>
                        <Pencil className="mr-2 size-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(fu.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 size-4" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <AssignCajeroDialog open={dialogOpen} onOpenChange={setDialogOpen} editData={editData} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function PoiFactPage() {
  const [installOpen, setInstallOpen] = React.useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="POI Fact"
        description="Configuracion de facturacion electronica y punto de venta"
        actions={
          <Button variant="outline" onClick={() => setInstallOpen(true)}>
            <Download className="mr-2 size-4" />
            Instalar POI Fact
          </Button>
        }
      />

      {/* Install Dialog */}
      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Instalar POI Fact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Download className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium">1. Descargar instalador</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Descarga el archivo <code className="rounded bg-muted px-1 py-0.5 text-[11px]">POI-Fact-Setup.exe</code> desde el servidor
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Monitor className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium">2. Instalar en Windows</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ejecuta el instalador y sigue las instrucciones. Requiere Windows 10 o superior.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Wifi className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium">3. Configurar conexión</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Al iniciar, POI Fact se conecta automáticamente a <code className="rounded bg-muted px-1 py-0.5 text-[11px]">erp.peruonice.com</code> para sincronizar datos.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Key className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium">4. Iniciar sesión con PIN</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Los cajeros ingresan con su PIN de 4 dígitos asignado en la sección de Cajeros de esta página.
                </p>
              </div>
            </div>
            <Separator />
            <a
              href="/downloads/POI-Fact-Setup-v1.0.2.exe"
              download="POI-Fact-Setup.exe"
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Download className="size-4" />
              Descargar Instalador v1.0.2
            </a>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList>
          <TabsTrigger value="config" className="gap-1.5">
            <Settings className="size-3.5" />
            Configuracion
          </TabsTrigger>
          <TabsTrigger value="series" className="gap-1.5">
            <Receipt className="size-3.5" />
            Series
          </TabsTrigger>
          <TabsTrigger value="registers" className="gap-1.5">
            <CreditCard className="size-3.5" />
            Cajas
          </TabsTrigger>
          <TabsTrigger value="cajeros" className="gap-1.5">
            <UserCheck className="size-3.5" />
            Cajeros
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card>
              <CardContent className="pt-6">
                <FactConfigForm />
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="series">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <SeriesTab />
          </motion.div>
        </TabsContent>

        <TabsContent value="registers">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <CashRegistersTab />
          </motion.div>
        </TabsContent>

        <TabsContent value="cajeros">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <CajerosTab />
          </motion.div>
        </TabsContent>

      </Tabs>
    </div>
  );
}
