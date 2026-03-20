"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCategorySchema, type CreateCategorySchemaType } from "@/lib/validators/product";
import { useCreateCategory, useUpdateCategory } from "@/hooks/queries/use-categories";
import type { ProductCategory } from "@/types/product";

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: ProductCategory | null;
  parentId?: string;
}

export function CategoryDialog({ open, onOpenChange, category, parentId }: CategoryDialogProps) {
  const isEditing = !!category;
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateCategorySchemaType>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createCategorySchema) as any,
    defaultValues: {
      name: category?.name ?? "",
      type: category?.type ?? "both",
      parent_id: category?.parent_id ?? parentId ?? "",
      sort_order: category?.sort_order ?? 0,
    },
  });

  const typeValue = watch("type");

  const onSubmit = async (data: CreateCategorySchemaType) => {
    const result = isEditing
      ? await updateMutation.mutateAsync({ id: category.id, data })
      : await createMutation.mutateAsync(data);

    if (!result.success) {
      toast.error(typeof result.error === "string" ? result.error : "Error al guardar");
      return;
    }

    toast.success(isEditing ? "Categoria actualizada" : "Categoria creada");
    reset();
    onOpenChange(false);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar categoria" : "Nueva categoria"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              placeholder="Nombre de la categoria"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select
              value={typeValue}
              onValueChange={(v) => setValue("type", v as "product" | "service" | "both")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Productos y Servicios</SelectItem>
                <SelectItem value="product">Solo Productos</SelectItem>
                <SelectItem value="service">Solo Servicios</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : isEditing ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
