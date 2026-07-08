"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type SelectControlOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

type SelectControlProps = {
  ariaLabel?: string;
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  name?: string;
  onValueChange?: (value: string) => void;
  options: SelectControlOption[];
  placeholder?: string;
  required?: boolean;
  value?: string;
};

export function SelectControl({
  ariaLabel,
  className,
  defaultValue = "",
  disabled = false,
  name,
  onValueChange,
  options,
  placeholder = "Select",
  required = false,
  value,
}: SelectControlProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const selectedValue = value ?? uncontrolledValue;
  const hasEmptyOption = options.some((option) => option.value === "");

  return (
    <select
      aria-label={ariaLabel}
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-border bg-surface px-2.5 text-[13px] outline-none shadow-sm transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-60",
        selectedValue ? "text-foreground" : "text-muted",
        className,
      )}
      disabled={disabled}
      name={name}
      onChange={(event) => {
        const nextValue = event.currentTarget.value;
        if (value === undefined) {
          setUncontrolledValue(nextValue);
        }
        onValueChange?.(nextValue);
      }}
      required={required}
      value={selectedValue}
    >
      {hasEmptyOption ? null : (
        <option disabled={required} value="">
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option
          disabled={option.disabled}
          key={`${option.value}-${option.label}`}
          value={option.value}
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}
