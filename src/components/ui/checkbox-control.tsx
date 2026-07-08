import type {
  ChangeEventHandler,
  InputHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

type CheckboxControlProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  onCheckedChange?: (checked: boolean) => void;
};

export function CheckboxControl({
  className,
  onChange,
  onCheckedChange,
  ...props
}: CheckboxControlProps) {
  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    onChange?.(event);
    onCheckedChange?.(event.currentTarget.checked);
  };

  return (
    <input
      {...props}
      className={cn(
        "size-4 shrink-0 rounded border border-border bg-surface accent-accent shadow-sm focus:outline-none focus:ring-2 focus:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      onChange={handleChange}
      type="checkbox"
    />
  );
}
