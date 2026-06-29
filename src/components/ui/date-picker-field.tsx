"use client";

import { useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";
import { cn } from "@/lib/utils";

const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type DatePickerFieldProps = {
  ariaLabel?: string;
  className?: string;
  defaultValue?: string;
  name: string;
  required?: boolean;
};

export function DatePickerField({
  ariaLabel,
  className,
  defaultValue = "",
  name,
  required = false,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getVisibleMonth(defaultValue),
  );
  const selectedDate = useMemo(() => parseDateValue(value), [value]);
  const days = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);

  return (
    <>
      <input name={name} required={required} type="hidden" value={value} />
      <Popover.Root onOpenChange={setOpen} open={open}>
        <Popover.Trigger asChild>
          <button
            aria-label={ariaLabel}
            className={cn(
              "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 text-left text-[13px] shadow-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft",
              className,
            )}
            type="button"
          >
            <span className={value ? "text-foreground" : "text-muted"}>
              {value ? formatDate(value) : "Select date"}
            </span>
            <CalendarDays className="shrink-0 text-muted" size={16} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            className="z-[80] w-[312px] rounded-md border border-border bg-surface p-3 shadow-lg"
            sideOffset={4}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                aria-label="Previous month"
                className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                onClick={() =>
                  setVisibleMonth((current) => addMonths(current, -1))
                }
                type="button"
              >
                <ChevronLeft size={15} />
              </button>
              <p className="text-sm font-semibold">
                {formatVisibleMonth(visibleMonth)}
              </p>
              <button
                aria-label="Next month"
                className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                onClick={() =>
                  setVisibleMonth((current) => addMonths(current, 1))
                }
                type="button"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted">
              {weekdays.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {days.map((day, index) =>
                day ? (
                  <button
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md text-sm transition-colors hover:bg-surface-muted",
                      selectedDate &&
                        isSameDate(selectedDate, day) &&
                        "bg-accent text-background hover:bg-accent",
                    )}
                    key={toDateValue(day)}
                    onClick={() => {
                      setValue(toDateValue(day));
                      setOpen(false);
                    }}
                    type="button"
                  >
                    {day.getDate()}
                  </button>
                ) : (
                  <span aria-hidden="true" key={`blank-${index}`} />
                ),
              )}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <button
                className="rounded-md px-2 py-1 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                onClick={() => {
                  setValue("");
                  setOpen(false);
                }}
                type="button"
              >
                Clear
              </button>
              <button
                className="rounded-md px-2 py-1 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted"
                onClick={() => {
                  const today = getBusinessDateValue();
                  setValue(today);
                  setVisibleMonth(getVisibleMonth(today));
                  setOpen(false);
                }}
                type="button"
              >
                Today
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function formatVisibleMonth(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function getCalendarDays(visibleMonth: Date) {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const days: Array<Date | null> = Array.from({ length: firstWeekday }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(year, month, day));
  }

  return days;
}

function getVisibleMonth(value: string) {
  const parsed = parseDateValue(value);
  const date = parsed ?? parseDateValue(getBusinessDateValue()) ?? new Date();

  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isSameDate(left: Date, right: Date) {
  return toDateValue(left) === toDateValue(right);
}

function parseDateValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toDateValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
