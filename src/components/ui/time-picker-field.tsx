"use client";

import { SelectControl } from "@/components/ui/select-control";

type TimePickerFieldProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true";
  "aria-labelledby"?: string;
  "aria-required"?: boolean | "false" | "true";
  ariaLabel?: string;
  className?: string;
  defaultValue?: string;
  name: string;
  required?: boolean;
};

const timeOptions = [
  { label: "No time", value: "" },
  ...Array.from({ length: 96 }, (_, index) => {
    const hour = Math.floor(index / 4);
    const minute = (index % 4) * 15;
    const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0",
    )}`;

    return { label: value, value };
  }),
];

export function TimePickerField({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledBy,
  "aria-required": ariaRequired,
  ariaLabel,
  className,
  defaultValue = "",
  name,
  required = false,
}: TimePickerFieldProps) {
  return (
    <SelectControl
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      aria-labelledby={ariaLabelledBy}
      aria-required={ariaRequired}
      ariaLabel={ariaLabel}
      className={className}
      defaultValue={defaultValue}
      name={name}
      options={required ? timeOptions.slice(1) : timeOptions}
      required={required}
    />
  );
}
