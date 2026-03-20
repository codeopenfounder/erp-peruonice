"use client";

import { useEffect } from "react";
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
import { createTagSchema, type CreateTagSchemaType } from "@/lib/validators/product";
import { useCreateTag, useUpdateTag } from "@/hooks/queries/use-categories";
import type { ProductTag } from "@/types/product";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

interface TagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag?: ProductTag | null;
  categoryId: string;
}

export function TagDialog({ open, onOpenChange, tag, categoryId }: TagDialogProps) {
  const isEditing = !!tag;
  const createMutation = useCreateTag();
  const updateMutation = useUpdateTag();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateTagSchemaType>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createTagSchema) as any,
    defaultValues: {
      category_id: tag?.category_id ?? categoryId,
      name: tag?.name ?? "",
      color: tag?.color ?? "",
      sort_order: tag?.sort_order ?? 0,
    },
  });

  const colorValue = watch("color");

  useEffect(() => {
    if (open) {
      reset({
        category_id: tag?.category_id ?? categoryId,
        name: tag?.name ?? "",
        color: tag?.color ?? "",
        sort_order: tag?.sort_order ?? 0,
      });
    }
  }, [open, categoryId, tag, reset]);

  const onSubmit = async (data: CreateTagSchemaType) => {
    const result = isEditing
      ? await updateMutation.mutateAsync({ id: tag.id, data: { name: data.name, color: data.color, sort_order: data.sort_order } })
      : await createMutation.mutateAsync(data);

    if (!result.success) {
      toast.error(typeof result.error === "string" ? result.error : "Error al guardar");
      return;
    }

    toast.success(isEditing ? "Etiqueta actualizada" : "Etiqueta creada");
    reset();
    onOpenChange(false);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar etiqueta" : "Nueva etiqueta"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tag-name">Nombre</Label>
            <Input
              id="tag-name"
              placeholder="Nombre de la etiqueta"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setValue("color", color)}
                  className="flex size-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor: colorValue === color ? "white" : "transparent",
                    boxShadow: colorValue === color ? `0 0 0 2px ${color}` : undefined,
                  }}
                />
              ))}
            </div>
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
