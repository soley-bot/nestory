import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "inputMode" | "type">;

export function NumberInput({ className, ...props }: NumberInputProps) {
  return (
    <Input
      className={cn("tabular-nums", className)}
      inputMode="decimal"
      type="text"
      {...props}
    />
  );
}
