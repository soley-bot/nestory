"use client";

import Link from "next/link";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardPeriodOption } from "@/components/dashboard/dashboard-period-picker";

export function DashboardPeriodPickerClient<TKey extends string = string>({
  href,
  options,
  paramName,
  selectedPeriod,
}: {
  href: string;
  options: Array<DashboardPeriodOption<TKey>>;
  paramName: string;
  selectedPeriod: TKey;
}) {
  const [open, setOpen] = useState(false);
  const selected =
    options.find((option) => option.key === selectedPeriod) ?? options[0];

  if (!selected) {
    return null;
  }

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger asChild>
        <button
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted",
            open && "bg-surface-muted",
          )}
          type="button"
        >
          <CalendarDays size={15} />
          {selected.label}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          className="z-[80] w-52 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg"
          sideOffset={6}
        >
          {options.map((option) => (
            <Link
              className={cn(
                "grid gap-0.5 px-3 py-2 text-left transition-colors hover:bg-surface-muted",
                option.key === selectedPeriod ? "bg-surface-muted" : null,
              )}
              href={getDashboardPeriodHref(href, paramName, option.key)}
              key={option.key}
              onNavigate={() => setOpen(false)}
              prefetch={false}
            >
              <span className="text-[13px] font-semibold text-foreground">
                {option.label}
              </span>
              <span className="text-[11px] text-foreground-subtle">
                {option.helper}
              </span>
            </Link>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function getDashboardPeriodHref(
  href: string,
  paramName: string,
  value: string,
) {
  const separator = href.includes("?") ? "&" : "?";

  return `${href}${separator}${paramName}=${encodeURIComponent(value)}`;
}
