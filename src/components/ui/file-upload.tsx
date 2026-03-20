"use client";

import * as React from "react";
import { Upload, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileUploadProps {
  label: string;
  description?: string;
  accept?: string;
  maxSizeMB?: number;
  value?: File | null;
  preview?: string | null;
  onChange: (file: File | null) => void;
  icon?: React.ReactNode;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function getAcceptDescription(accept?: string): string {
  if (!accept) return "Cualquier archivo";
  return accept
    .split(",")
    .map((s) => s.trim())
    .join(", ");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FileUpload({
  label,
  description,
  accept,
  maxSizeMB = 5,
  value,
  preview,
  onChange,
  icon,
  disabled = false,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(
    preview ?? null
  );

  // Sync previewUrl with value (File) or preview (URL from DB)
  React.useEffect(() => {
    if (value && isImageFile(value)) {
      const url = URL.createObjectURL(value);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    // Always sync with preview prop when no File is selected
    setPreviewUrl(preview ?? null);
  }, [value, preview]);

  const handleFile = React.useCallback(
    (file: File) => {
      if (file.size > maxSizeMB * 1024 * 1024) {
        toast.error(
          `El archivo excede el tamano maximo de ${maxSizeMB} MB`
        );
        return;
      }
      onChange(file);
    },
    [maxSizeMB, onChange]
  );

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [disabled, handleFile]
  );

  const handleDragOver = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragOver(true);
    },
    [disabled]
  );

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset input so the same file can be selected again
      e.target.value = "";
    },
    [handleFile]
  );

  const handleRemove = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(null);
      setPreviewUrl(null);
    },
    [onChange]
  );

  const hasFile = (value !== null && value !== undefined) || !!previewUrl;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200",
          disabled
            ? "cursor-not-allowed border-border/50 opacity-50"
            : "cursor-pointer border-border hover:border-primary/50",
          isDragOver && !disabled && "border-primary bg-primary/5 scale-[1.02]",
          hasFile && "border-solid border-border bg-secondary/30"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={handleInputChange}
          className="hidden"
          aria-label={label}
        />

        {hasFile ? (
          /* File selected or preview URL state */
          <div className="animate-in fade-in duration-300 space-y-3">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={value?.name ?? "Preview"}
                className="max-h-40 rounded-lg object-cover mx-auto"
              />
            ) : value ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border mx-auto max-w-xs">
                <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {value.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(value.size)}
                  </p>
                </div>
              </div>
            ) : null}

            {value ? (
              <div className="text-xs text-muted-foreground">
                {value.name} - {formatFileSize(value.size)}
              </div>
            ) : previewUrl && !value ? (
              <div className="text-xs text-muted-foreground">
                Archivo guardado
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              className="inline-flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
            >
              <X className="h-3 w-3" />
              Eliminar
            </button>
          </div>
        ) : (
          /* Empty / drop zone state */
          <div className="space-y-2">
            <div className="flex justify-center text-muted-foreground">
              {icon ?? <Upload className="h-8 w-8" />}
            </div>
            <p className="text-sm text-muted-foreground">
              Arrastra o haz clic para subir
            </p>
            <p className="text-xs text-muted-foreground/70">
              {getAcceptDescription(accept)} - Max {maxSizeMB} MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
