"use client";

import { SelectControl } from "@/components/ui/select-control";

type TimePickerFieldProps = {
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
  ariaLabel,
  className,
  defaultValue = "",
  name,
  required = false,
}: TimePickerFieldProps) {
  return (
    <SelectControl
      ariaLabel={ariaLabel}
      className={className}
      defaultValue={defaultValue}
      name={name}
      options={required ? timeOptions.slice(1) : timeOptions}
      required={required}
    />
  );
}
