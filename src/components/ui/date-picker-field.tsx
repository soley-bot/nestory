import { cn } from "@/lib/utils";

type DatePickerFieldProps = {
  ariaLabel?: string;
  className?: string;
  defaultValue?: string;
  name: string;
  required?: boolean;
};

export function DatePickerField({
  ariaLabel,
  className,
  defaultValue = "",
  name,
  required = false,
}: DatePickerFieldProps) {
  return (
    <input
      aria-label={ariaLabel}
      className={cn(
        "h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[13px] outline-none shadow-sm transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft",
        className,
      )}
      defaultValue={defaultValue}
      name={name}
      required={required}
      type="date"
    />
  );
}
