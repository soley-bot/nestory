"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDrawerPortalContainer } from "@/components/ui/side-drawer";
import { cn } from "@/lib/utils";

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
  contentFooter?: ReactNode;
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
  const portalContainer = useDrawerPortalContainer();
  const {
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    "aria-labelledby": ariaLabelledBy,
    "aria-required": ariaRequired,
    ariaLabel,
    className,
    contentFooter,
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
      <Select
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
        <SelectTrigger
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-required={ariaRequired ?? required}
          className={cn("w-full min-w-0", className)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent
          className="z-[80] max-h-72 max-w-[calc(100vw-1rem)]"
          onEscapeKeyDown={(event) => event.stopPropagation()}
          position="popper"
          portalContainer={portalContainer}
          sideOffset={4}
        >
          <SelectGroup>
            {options.map((option) => (
              <SelectItem
                className="max-w-[min(28rem,calc(100vw-2rem))] whitespace-normal"
                disabled={option.disabled}
                key={`${option.value}-${option.label}`}
                value={toRadixItemValue(option.value)}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
          {contentFooter ? <div className="border-t p-2">{contentFooter}</div> : null}
        </SelectContent>
      </Select>
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
