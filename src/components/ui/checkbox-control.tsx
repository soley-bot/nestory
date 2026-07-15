"use client";

import * as Checkbox from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type CheckboxControlProps = ComponentPropsWithoutRef<typeof Checkbox.Root>;

export function CheckboxControl({ className, ...props }: CheckboxControlProps) {
  return (
    <Checkbox.Root
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded border border-border bg-surface text-background shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    >
      <Checkbox.Indicator asChild>
        <Check size={12} strokeWidth={3} />
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}
