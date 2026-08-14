"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DayPicker } from "@daypicker/react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";
import { cn } from "@/lib/utils";
import { useDrawerPortalContainer } from "@/components/ui/side-drawer";

type DatePickerFieldProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true";
  "aria-labelledby"?: string;
  "aria-required"?: boolean | "false" | "true";
  ariaLabel?: string;
  className?: string;
  defaultValue?: string;
  name: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
};

export function DatePickerField(props: DatePickerFieldProps) {
  const {
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledBy,
  "aria-required": ariaRequired,
  ariaLabel,
  className,
  defaultValue = "",
  name,
  onValueChange,
  required = false,
  } = props;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const previousValueRef = useRef(value);
  const portalContainer = useDrawerPortalContainer();
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getVisibleMonth(defaultValue),
  );
  const selectedDate = useMemo(() => parseDateValue(value), [value]);

  useEffect(() => {
    if (previousValueRef.current === value) {
      return;
    }

    previousValueRef.current = value;
    hiddenInputRef.current?.dispatchEvent(
      new Event("input", { bubbles: true }),
    );
  }, [value]);

  return (
    <>
      <input
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired ?? required}
        name={name}
        onInput={(event) => {
          const nextValue = event.currentTarget.value;
          setValue(nextValue);
          onValueChange?.(nextValue);
        }}
        ref={hiddenInputRef}
        required={required}
        type="hidden"
        value={value}
      />
      <Popover.Root onOpenChange={setOpen} open={open}>
        <Popover.Trigger asChild>
          <button
            aria-describedby={ariaDescribedBy}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            className={cn(
              "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-2.5 text-left text-sm shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring",
              className,
            )}
            type="button"
          >
            <span className={value ? "text-foreground" : "text-muted-foreground"}>
              {value ? formatDate(value) : "Select date"}
            </span>
            <CalendarDays className="shrink-0 text-muted-foreground" size={16} />
          </button>
        </Popover.Trigger>
        <Popover.Portal container={portalContainer ?? undefined}>
          <Popover.Content
            align="start"
            className="z-[80] w-[312px] rounded-md border border-border bg-card p-3 shadow-lg"
            onEscapeKeyDown={(event) => event.stopPropagation()}
            sideOffset={4}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                aria-label="Previous month"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() =>
                  setVisibleMonth((current) => addMonths(current, 1))
                }
                type="button"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            <DayPicker
              classNames={{
                caption_label: "sr-only",
                day: "p-0 text-center align-middle",
                day_button:
                  "flex size-8 items-center justify-center rounded-md text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                disabled: "text-muted-foreground opacity-40",
                month_caption: "sr-only",
                month_grid: "mt-3 w-full border-separate border-spacing-1",
                months: "space-y-0",
                outside: "text-muted-foreground opacity-40",
                root: "mt-1",
                selected:
                  "[&>button]:bg-accent [&>button]:text-background [&>button]:hover:bg-accent",
                today: "[&>button]:border [&>button]:border-accent",
                weekday: "h-7 text-center text-xs font-medium text-muted-foreground",
              }}
              fixedWeeks
              hideNavigation
              mode="single"
              month={visibleMonth}
              onMonthChange={setVisibleMonth}
              onSelect={(day) => {
                if (!day) {
                  return;
                }

                const nextValue = toDateValue(day);
                setValue(nextValue);
                onValueChange?.(nextValue);
                setOpen(false);
              }}
              selected={selectedDate ?? undefined}
              showOutsideDays
            />

            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <button
                className="rounded-md px-2 py-1 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
                className="rounded-md px-2 py-1 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  const today = getBusinessDateValue();
                  setValue(today);
                  onValueChange?.(today);
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

function getVisibleMonth(value: string) {
  const parsed = parseDateValue(value);
  const date = parsed ?? parseDateValue(getBusinessDateValue()) ?? new Date();

  return new Date(date.getFullYear(), date.getMonth(), 1);
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
