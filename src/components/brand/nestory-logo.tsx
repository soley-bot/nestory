import Image from "next/image";

import { cn } from "@/lib/utils";

type NestoryLogoProps = {
  className?: string;
  markClassName?: string;
  markTone?: "auto" | "dark" | "light";
  priority?: boolean;
  showText?: boolean;
  subtitle?: string;
  subtitleClassName?: string;
  textClassName?: string;
};

export function NestoryLogo({
  className,
  markClassName,
  markTone = "auto",
  priority = false,
  showText = true,
  subtitle = "Property Management",
  subtitleClassName,
  textClassName,
}: NestoryLogoProps) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden",
          markClassName,
        )}
      >
        <Image
          alt=""
          aria-hidden="true"
          className={cn(
            "object-contain",
            markTone === "auto" && "nestory-logo-mark-auto",
            markTone === "light" && "brightness-0 invert",
          )}
          fill
          priority={priority}
          sizes="32px"
          src="/logo/nestory-mark.png"
        />
      </span>
      {showText ? (
        <span className="min-w-0 leading-none">
          <span
            className={cn(
              "block truncate text-[13px] font-semibold",
              textClassName,
            )}
          >
            Nestory
          </span>
          <span
            className={cn(
              "mt-1 block truncate text-[10px] font-medium uppercase tracking-[0.14em]",
              subtitleClassName,
            )}
          >
            {subtitle}
          </span>
        </span>
      ) : null}
    </span>
  );
}
