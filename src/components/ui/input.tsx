import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[13px] outline-none shadow-sm transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft",
        className,
      )}
      {...props}
    />
  );
}
