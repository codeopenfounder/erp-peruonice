"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useCreateBranch, useUpdateBranch } from "@/hooks/queries/use-branches";
import { useUsers } from "@/hooks/queries/use-users";
import {
  createBranchSchema,
  type CreateBranchSchemaType,
} from "@/lib/validators/branch";
import type { BranchListItem } from "@/types/branch";

const BRANCH_TYPES = [
  { value: "sede_principal", label: "Sede Principal" },
  { value: "sucursal", label: "Sucursal" },
  { value: "oficina", label: "Oficina" },
  { value: "almacen", label: "Almacen" },
  { value: "planta", label: "Planta" },
];

interface BranchFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editBranch?: BranchListItem | null;
}

export function BranchFormDialog({
  open,
  onOpenChange,
  editBranch,
}: BranchFormDialogProps) {
  const createMutation = useCreateBranch();
  const updateMutation = useUpdateBranch();
  const { data: usersResult } = useUsers();
  const employees = (usersResult ?? []).filter((u) => u.is_active);
  const isEditing = !!editBranch;

  const form = useForm<CreateBranchSchemaType>({
    resolver: zodResolver(createBranchSchema) as any,
    defaultValues: {
      name: "",
      type: "sucursal",
      is_main: false,
      address: "",
      department: "",
      province: "",
      district: "",
      phone: "",
      email: "",
      manager_id: "",
    },
  });

  React.useEffect(() => {
    if (open && editBranch) {
      form.reset({
        name: editBranch.name,
        type: editBranch.type,
        is_main: editBranch.is_main,
        address: editBranch.address || "",
        department: editBranch.department || "",
        province: editBranch.province || "",
        district: editBranch.district || "",
        phone: editBranch.phone || "",
        email: editBranch.email || "",
        manager_id: editBranch.manager_id || "",
      });
    } else if (open) {
      form.reset({
        name: "",
        type: "sucursal",
        is_main: false,
        address: "",
        department: "",
        province: "",
        district: "",
        phone: "",
        email: "",
        manager_id: "",
      });
    }
  }, [open, editBranch, form]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = async (values: CreateBranchSchemaType) => {
    try {
      const result = isEditing
        ? await updateMutation.mutateAsync({
            id: editBranch!.id,
            data: values,
          })
        : await createMutation.mutateAsync(values);

      if (result.success) {
        toast.success(
          isEditing ? "Sede actualizada" : "Sede creada correctamente",
        );
        onOpenChange(false);
      } else {
        const msg =
          typeof result.error === "string"
            ? result.error
            : "Error al guardar la sede";
        toast.error(msg);
      }
    } catch {
      toast.error("Error al guardar la sede");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Sede" : "Nueva Sede"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Name & Type */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Sede Lima Centro" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BRANCH_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_main"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="text-sm font-normal">
                    Es la sede principal de la empresa
                  </FormLabel>
                </FormItem>
              )}
            />

            <Separator />

            {/* Location */}
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Ubicacion
            </p>
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Direccion</FormLabel>
                  <FormControl>
                    <Input placeholder="Av. Javier Prado 1234" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Departamento</FormLabel>
                    <FormControl>
                      <Input placeholder="Lima" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="province"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provincia</FormLabel>
                    <FormControl>
                      <Input placeholder="Lima" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="district"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Distrito</FormLabel>
                    <FormControl>
                      <Input placeholder="San Isidro" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Contact & Capacity */}
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Contacto
            </p>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefono</FormLabel>
                    <FormControl>
                      <Input placeholder="+51 1 234 5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="sede@empresa.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="manager_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsable</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {employees.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.first_name} {emp.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
              <Button type="submit" disabled={isPending}>
                {isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditing ? "Guardar" : "Crear Sede"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
