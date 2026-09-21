"use client";
import type { InputHTMLAttributes } from "react";
import { normalizeCurrencyInput } from "@/lib/format/currency-input";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "inputMode" | "type"> & { currencyPaste?: boolean };

export function NumberInput({ className, currencyPaste = false, onChange, ...props }: NumberInputProps) {
  return (
    <Input
      className={cn("tabular-nums", className)}
      inputMode="decimal"
      type="text"
      onChange={(event) => {
        if (currencyPaste) event.target.value = normalizeCurrencyInput(event.target.value);
        onChange?.(event);
      }}
      {...props}
    />
  );
}
