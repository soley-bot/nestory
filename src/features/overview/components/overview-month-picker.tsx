"use client";

import { useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { buildOverviewHref, firstOverviewMonth, formatOverviewMonth } from "@/features/overview/overview.filters";
import type { OverviewViewQuery } from "@/features/overview/overview.types";
import { cn } from "@/lib/utils";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function OverviewMonthPicker({
  className,
  financialStartDate,
  query,
}: {
  className?: string;
  financialStartDate?: string | null;
  query: OverviewViewQuery;
}) {
  const [open, setOpen] = useState(false);
  const [selectedYear, selectedMonth] = query.month.split("-").map(Number);
  const [visibleYear, setVisibleYear] = useState(selectedYear);
  const monthLabel = formatOverviewMonth(query.month);
  const firstMonth = firstOverviewMonth(financialStartDate);

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger asChild>
        <button
          aria-label={`Change reporting month, currently ${monthLabel}`}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
            open && "bg-muted",
            className,
          )}
          type="button"
        >
          <CalendarDays aria-hidden="true" size={13} />
          {monthLabel}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="z-[80] w-[300px] rounded-md border border-border bg-card p-3 shadow-lg"
          sideOffset={6}
        >
          <div className="flex items-center justify-between gap-2">
            <button
              aria-label="Previous year"
              disabled={Boolean(firstMonth && visibleYear <= Number(firstMonth.slice(0, 4)))}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setVisibleYear((year) => year - 1)}
              type="button"
            >
              <ChevronLeft size={15} />
            </button>
            <p className="text-sm font-semibold">{visibleYear}</p>
            <button
              aria-label="Next year"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setVisibleYear((year) => year + 1)}
              type="button"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {monthNames.map((name, index) => {
              const monthNumber = index + 1;
              const month = `${visibleYear}-${String(monthNumber).padStart(2, "0")}`;
              const active = visibleYear === selectedYear && monthNumber === selectedMonth;
              if (firstMonth && month < firstMonth) return <button key={name} type="button" disabled className="flex h-8 items-center justify-center rounded-md text-sm text-muted-foreground opacity-40">{name}</button>;
              return (
                <Link
                  aria-current={active ? "date" : undefined}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md text-sm font-medium text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    active &&
                      "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                  href={buildOverviewHref(query, { month })}
                  key={name}
                  onNavigate={() => setOpen(false)}
                  prefetch={false}
                >
                  {name}
                </Link>
              );
            })}
          </div>
          {firstMonth ? <p className="mt-3 text-xs text-muted-foreground">Reporting available from {formatOverviewMonth(firstMonth)}.</p> : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
