"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useDrawerPortalContainer } from "@/components/ui/side-drawer";
import { cn } from "@/lib/utils";

export type SearchableSelectControlOption = {
  description?: string;
  disabled?: boolean;
  label: string;
  meta?: string;
  searchText?: string;
  value: string;
};

type SearchableSelectControlProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true";
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  name?: string;
  onValueChange?: (value: string) => void;
  options: SearchableSelectControlOption[];
  placeholder?: string;
  required?: boolean;
  value: string;
};

export function SearchableSelectControl({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ariaLabel,
  className,
  disabled = false,
  name,
  onValueChange,
  options,
  placeholder = "Select",
  required = false,
  value,
}: SearchableSelectControlProps) {
  const listboxId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const portalContainer = useDrawerPortalContainer();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedOption = options.find((option) => option.value === value);
  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) =>
      [
        option.label,
        option.description,
        option.meta,
        option.searchText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [options, query]);
  const activeOption = visibleOptions[activeIndex] ?? visibleOptions[0];

  function choose(option: SearchableSelectControlOption) {
    if (option.disabled) {
      return;
    }

    onValueChange?.(option.value);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) =>
        Math.max(0, Math.min(visibleOptions.length - 1, current + direction)),
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, visibleOptions.length - 1));
    } else if (event.key === "Enter" && activeOption) {
      event.preventDefault();
      choose(activeOption);
    }
  }

  return (
    <>
      {name ? (
        <input name={name} required={required} type="hidden" value={value} />
      ) : null}
      <Popover.Root
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setQuery("");
            setActiveIndex(0);
          }
        }}
        open={open}
      >
        <Popover.Trigger asChild>
          <button
            aria-describedby={ariaDescribedBy}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={ariaLabel}
            className={cn(
              "flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-md border border-control-border bg-surface px-3 py-2 text-left shadow-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60",
              className,
            )}
            disabled={disabled}
            data-invalid={ariaInvalid === true || ariaInvalid === "true"}
            type="button"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">
                {selectedOption?.label ?? placeholder}
              </span>
              {selectedOption?.description ? (
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {selectedOption.description}
                </span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
              {selectedOption?.meta}
              <ChevronsUpDown aria-hidden="true" size={15} />
            </span>
          </button>
        </Popover.Trigger>
        <Popover.Portal container={portalContainer ?? undefined}>
          <Popover.Content
            align="start"
            className="z-[90] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1rem)] rounded-md border border-border bg-surface p-1 shadow-lg"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              searchRef.current?.focus();
            }}
            sideOffset={4}
          >
            <label className="relative block">
              <span className="sr-only">Search {ariaLabel}</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                size={15}
              />
              <input
                aria-activedescendant={
                  activeOption
                    ? `${listboxId}-${encodeURIComponent(activeOption.value)}`
                    : undefined
                }
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-expanded={open}
                aria-invalid={ariaInvalid}
                className="h-9 w-full rounded-md border border-control-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-focus-ring"
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder="Search"
                ref={searchRef}
                role="combobox"
                value={query}
              />
            </label>
            <div
              aria-label={`${ariaLabel} options`}
              className="mt-1 max-h-64 overflow-y-auto"
              id={listboxId}
              role="listbox"
            >
              {visibleOptions.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted" role="status">
                  No matching options.
                </p>
              ) : (
                visibleOptions.map((option, index) => (
                  <button
                    aria-selected={option.value === value}
                    className={cn(
                      "flex min-h-11 w-full min-w-0 items-center gap-3 rounded px-2.5 py-2 text-left outline-none transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted disabled:pointer-events-none disabled:opacity-50",
                      activeOption?.value === option.value && "bg-surface-muted",
                    )}
                    disabled={option.disabled}
                    id={`${listboxId}-${encodeURIComponent(option.value)}`}
                    key={option.value}
                    onClick={() => choose(option)}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {option.meta ? (
                      <span className="shrink-0 text-xs text-muted">
                        {option.meta}
                      </span>
                    ) : null}
                    {option.value === value ? (
                      <Check aria-hidden="true" className="shrink-0 text-accent" size={15} />
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
