"use client";

import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FilterPopoverProps = {
  activeCount?: number;
  children: ReactNode;
  contentClassName?: string;
  description?: string;
  id?: string;
  label?: string;
  title: string;
};

export function FilterPopover({
  activeCount = 0,
  children,
  contentClassName,
  description,
  id,
  label = "Filters",
  title,
}: FilterPopoverProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button type="button">
          <SlidersHorizontal size={14} />
          {label}
          {activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          className={cn(
            "z-50 w-[min(560px,calc(100vw-2rem))] rounded-md border border-border bg-surface p-3 shadow-lg outline-none",
            contentClassName,
          )}
          id={id}
          sideOffset={6}
        >
          <div className="mb-3">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {description ? (
              <p className="mt-0.5 text-xs text-muted">{description}</p>
            ) : null}
          </div>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
