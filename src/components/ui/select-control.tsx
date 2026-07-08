"use client";

import { useState } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const EMPTY_VALUE = "__nestory_empty_value__";

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
  const radixValue = toRadixValue(selectedValue, hasEmptyOption);

  return (
    <>
      {name ? (
        <input
          disabled={disabled}
          name={name}
          required={required}
          type="hidden"
          value={selectedValue}
        />
      ) : null}
      <Select.Root
        disabled={disabled}
        onValueChange={(nextValue) => {
          const formValue = fromRadixValue(nextValue);
          if (value === undefined) {
            setUncontrolledValue(formValue);
          }
          onValueChange?.(formValue);
        }}
        value={radixValue}
      >
        <Select.Trigger
          aria-label={ariaLabel}
          className={cn(
            "flex h-8 w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-md border border-border bg-surface px-2.5 text-left text-[13px] shadow-sm outline-none transition-colors data-[placeholder]:text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-60",
            className,
          )}
          type="button"
        >
          <span className="min-w-0 flex-1 truncate whitespace-nowrap">
            <Select.Value placeholder={placeholder} />
          </span>
          <Select.Icon asChild>
            <ChevronDown className="shrink-0 text-muted" size={14} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="z-[80] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-surface shadow-lg"
            position="popper"
            sideOffset={4}
          >
            <Select.Viewport className="p-1">
              <Select.Group>
                {options.map((option) => (
                  <Select.Item
                    className="relative flex min-h-8 cursor-default select-none items-center rounded-md px-2 pr-8 text-[13px] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-muted data-[highlighted]:text-foreground"
                    disabled={option.disabled}
                    key={`${option.value}-${option.label}`}
                    value={toRadixItemValue(option.value)}
                  >
                    <Select.ItemText>{option.label}</Select.ItemText>
                    <Select.ItemIndicator className="absolute right-2 inline-flex items-center">
                      <Check size={14} />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Group>
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </>
  );
}

function toRadixValue(value: string, hasEmptyOption: boolean) {
  if (value === "") {
    return hasEmptyOption ? EMPTY_VALUE : undefined;
  }

  return value;
}

function toRadixItemValue(value: string) {
  return value === "" ? EMPTY_VALUE : value;
}

function fromRadixValue(value: string) {
  return value === EMPTY_VALUE ? "" : value;
}
