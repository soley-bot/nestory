"use client";

import { useEffect, useRef, useState } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDrawerPortalContainer } from "@/components/ui/side-drawer";

const EMPTY_VALUE = "__nestory_empty_value__";

export type SelectControlOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

type SelectControlProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true";
  "aria-labelledby"?: string;
  "aria-required"?: boolean | "false" | "true";
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

export function SelectControl(props: SelectControlProps) {
  const {
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledBy,
  "aria-required": ariaRequired,
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
  } = props;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const selectedValue = value ?? uncontrolledValue;
  const previousValueRef = useRef(selectedValue);
  const portalContainer = useDrawerPortalContainer();
  const hasEmptyOption = options.some((option) => option.value === "");
  const radixValue = toRadixValue(selectedValue, hasEmptyOption);

  useEffect(() => {
    if (previousValueRef.current === selectedValue) {
      return;
    }

    previousValueRef.current = selectedValue;
    hiddenInputRef.current?.dispatchEvent(
      new Event("input", { bubbles: true }),
    );
  }, [selectedValue]);

  return (
    <>
      {name ? (
        <input
          disabled={disabled}
          name={name}
          ref={hiddenInputRef}
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
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-required={ariaRequired ?? required}
          className={cn(
            "flex h-8 w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-md border border-border bg-surface px-2.5 text-left text-sm shadow-sm outline-none transition-colors data-[placeholder]:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60",
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
        <Select.Portal container={portalContainer ?? undefined}>
          <Select.Content
            className="z-[80] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-surface shadow-lg"
            position="popper"
            onEscapeKeyDown={(event) => event.stopPropagation()}
            sideOffset={4}
          >
            <Select.Viewport className="p-1">
              <Select.Group>
                {options.map((option) => (
                  <Select.Item
                    className="relative flex min-h-8 cursor-default select-none items-center rounded-md px-2 pr-8 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-muted data-[highlighted]:text-foreground"
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
