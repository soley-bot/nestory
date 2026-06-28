import { cn } from "@/lib/utils";
import type { MoneyDisplayValue } from "@/lib/money/format";

type MoneyDisplayProps = {
  align?: "left" | "right";
  className?: string;
  size?: "compact" | "large";
  value: MoneyDisplayValue;
};

export function MoneyDisplay({
  align = "left",
  className,
  size = "compact",
  value,
}: MoneyDisplayProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 flex-col",
        align === "right" ? "items-end text-right" : "items-start text-left",
        className,
      )}
    >
      <span
        className={cn(
          "min-w-0 break-words tabular-nums [overflow-wrap:anywhere]",
          size === "large" ? "text-base font-semibold tracking-tight" : "font-medium",
        )}
      >
        {value.primary}
      </span>
    </span>
  );
}
