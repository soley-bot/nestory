"use client";

import { useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { getBusinessMonthValue } from "@/lib/dates/business-date";
import { cn } from "@/lib/utils";

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue ?? getCurrentMonthValue());
  const [visibleYear, setVisibleYear] = useState(() => getYearFromMonth(value));
  const selectedMonth = useMemo(() => parseMonthValue(value), [value]);

  return (
    <>
      <input name={name} required={required} type="hidden" value={value} />
      <Popover.Root onOpenChange={setOpen} open={open}>
        <Popover.Trigger asChild>
          <button
            aria-label={ariaLabel}
            className={cn(
              "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-control-border bg-surface px-2.5 text-left text-sm shadow-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring",
              className,
            )}
            type="button"
          >
            <span className={value ? "text-foreground" : "text-muted"}>
              {value ? formatMonthLabel(value) : "Select month"}
            </span>
            <CalendarDays className="shrink-0 text-muted" size={16} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            className="z-[80] w-[300px] rounded-md border border-border bg-surface p-3 shadow-lg"
            sideOffset={4}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                aria-label="Previous year"
                className="flex size-8 items-center justify-center rounded-md text-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
                onClick={() => setVisibleYear((year) => year - 1)}
                type="button"
              >
                <ChevronLeft size={15} />
              </button>
              <p className="text-sm font-semibold">{visibleYear}</p>
              <button
                aria-label="Next year"
                className="flex size-8 items-center justify-center rounded-md text-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
                onClick={() => setVisibleYear((year) => year + 1)}
                type="button"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {monthNames.map((month, index) => {
                const monthNumber = index + 1;
                const monthValue = toMonthValue(visibleYear, monthNumber);
                const isSelected =
                  selectedMonth?.year === visibleYear &&
                  selectedMonth.month === monthNumber;

                return (
                  <button
                    className={cn(
                      "h-8 rounded-md text-sm font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
                      isSelected
                        ? "bg-accent text-background hover:bg-accent"
                        : "text-foreground",
                    )}
                    key={month}
                    onClick={() => {
                      setValue(monthValue);
                      onValueChange?.(monthValue);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    {month}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <button
                className="rounded-md px-2 py-1 text-sm font-medium text-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
                onClick={() => {
                  setValue("");
                  onValueChange?.("");
                  setOpen(false);
                }}
                type="button"
              >
                Clear
              </button>
              <button
                className="rounded-md px-2 py-1 text-sm font-medium text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
                onClick={() => {
                  const currentMonth = getCurrentMonthValue();
                  setValue(currentMonth);
                  onValueChange?.(currentMonth);
                  setVisibleYear(getYearFromMonth(currentMonth));
                  setOpen(false);
                }}
                type="button"
              >
                This month
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}

function formatMonthLabel(value: string) {
  const parsed = parseMonthValue(value);

  if (!parsed) {
    return "Select month";
  }

  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(new Date(parsed.year, parsed.month - 1, 1));
}

function getCurrentMonthValue() {
  return getBusinessMonthValue();
}

function getYearFromMonth(value: string) {
  return parseMonthValue(value)?.year ?? Number(getBusinessMonthValue().slice(0, 4));
}

function parseMonthValue(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  return {
    month: Number(match[2]),
    year: Number(match[1]),
  };
}

function toMonthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}
