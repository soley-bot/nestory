import { getBusinessMonthValue } from "@/lib/dates/business-date";
import { cn } from "@/lib/utils";

type MonthPickerFieldProps = {
  ariaLabel?: string;
  className?: string;
  defaultValue?: string;
  name: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
};

export function MonthPickerField({
  ariaLabel,
  className,
  defaultValue,
  name,
  onValueChange,
  required = false,
}: MonthPickerFieldProps) {
  return (
    <input
      aria-label={ariaLabel}
      className={cn(
        "h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[13px] outline-none shadow-sm transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft",
        className,
      )}
      defaultValue={defaultValue ?? getBusinessMonthValue()}
      name={name}
      onInput={(event) => onValueChange?.(event.currentTarget.value)}
      required={required}
      type="month"
    />
  );
}
