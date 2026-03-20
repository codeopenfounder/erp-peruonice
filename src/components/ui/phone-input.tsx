"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  PHONE_CODES,
  DEFAULT_PHONE_CODE,
  type PhoneCode,
} from "@/data/phone-codes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePhoneValue(value: string): { dialCode: string; number: string } {
  if (!value || !value.startsWith("+")) {
    return { dialCode: DEFAULT_PHONE_CODE.dialCode, number: value || "" };
  }
  const firstSpace = value.indexOf(" ");
  if (firstSpace === -1) {
    // Only dial code, no number
    const match = PHONE_CODES.find((p) => value.startsWith(p.dialCode));
    if (match) return { dialCode: match.dialCode, number: "" };
    return { dialCode: DEFAULT_PHONE_CODE.dialCode, number: "" };
  }
  const dialCode = value.slice(0, firstSpace);
  const number = value.slice(firstSpace + 1);
  return { dialCode, number };
}

function findCodeEntry(dialCode: string): PhoneCode {
  return PHONE_CODES.find((p) => p.dialCode === dialCode) ?? DEFAULT_PHONE_CODE;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PhoneInputProps {
  value?: string;
  onValueChange: (value: string) => void;
  defaultCountry?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function PhoneInput({
  value = "",
  onValueChange,
  placeholder = "999 888 777",
  disabled = false,
  className,
}: PhoneInputProps) {
  const [open, setOpen] = React.useState(false);

  const { dialCode, number } = React.useMemo(() => parsePhoneValue(value), [value]);
  const entry = React.useMemo(() => findCodeEntry(dialCode), [dialCode]);

  const handleDialChange = (newDial: string) => {
    const combined = number ? `${newDial} ${number}` : "";
    onValueChange(combined);
    setOpen(false);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d\s]/g, "");
    const combined = raw ? `${dialCode} ${raw}` : "";
    onValueChange(combined);
  };

  return (
    <div
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent text-sm shadow-xs",
        "transition-colors focus-within:ring-1 focus-within:ring-ring",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {/* Prefix selector */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "h-full shrink-0 gap-1 rounded-r-none border-r border-input px-2",
              "hover:bg-accent/50 focus:outline-none",
            )}
          >
            <span className="text-base leading-none">{entry.flag}</span>
            <span className="text-xs text-muted-foreground">{entry.dialCode}</span>
            <ChevronsUpDown className="size-3 shrink-0 opacity-40" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar pais..." />
            <CommandList>
              <CommandEmpty>No encontrado</CommandEmpty>
              <CommandGroup>
                {PHONE_CODES.map((item) => (
                  <CommandItem
                    key={item.code}
                    value={`${item.country} ${item.code} ${item.dialCode}`}
                    onSelect={() => handleDialChange(item.dialCode)}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-3.5",
                        entry.code === item.code ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="mr-2 text-base leading-none">{item.flag}</span>
                    <span className="flex-1 truncate">{item.country}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {item.dialCode}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Number input */}
      <input
        type="tel"
        inputMode="numeric"
        value={number}
        onChange={handleNumberChange}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "flex-1 bg-transparent px-3 py-1 text-sm outline-none",
          "placeholder:text-muted-foreground",
          disabled && "cursor-not-allowed",
        )}
      />
    </div>
  );
}
