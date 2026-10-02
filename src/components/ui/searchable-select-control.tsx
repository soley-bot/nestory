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
  "aria-labelledby"?: string;
  "aria-required"?: boolean | "false" | "true";
  ariaLabel: string;
  className?: string;
  contentClassName?: string;
  wrapOptions?: boolean;
  disabled?: boolean;
  name?: string;
  onValueChange?: (value: string) => void;
  options: SearchableSelectControlOption[];
  placeholder?: string;
  required?: boolean;
  triggerRole?: "button" | "combobox";
  value: string;
};

export function SearchableSelectControl({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledBy,
  "aria-required": ariaRequired,
  ariaLabel,
  className,
  contentClassName,
  wrapOptions = false,
  disabled = false,
  name,
  onValueChange,
  options,
  placeholder = "Select",
  required = false,
  triggerRole,
  value,
}: SearchableSelectControlProps) {
  const listboxId = useId();
  const searchLabelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tabbingAwayRef = useRef(false);
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
  const activeOption = visibleOptions[activeIndex]?.disabled
    ? visibleOptions.find((option) => !option.disabled)
    : visibleOptions[activeIndex] ??
      visibleOptions.find((option) => !option.disabled);

  function choose(option: SearchableSelectControlOption) {
    if (option.disabled || disabled || triggerRef.current?.matches(":disabled")) {
      return;
    }

    onValueChange?.(option.value);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const enabledOptions = visibleOptions.filter((option) => !option.disabled);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const currentIndex = activeOption ? enabledOptions.indexOf(activeOption) : -1;
      const nextOption =
        enabledOptions[
          Math.max(0, Math.min(enabledOptions.length - 1, currentIndex + direction))
        ];
      setActiveIndex(nextOption ? visibleOptions.indexOf(nextOption) : 0);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(visibleOptions.indexOf(enabledOptions[0]));
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(
        visibleOptions.indexOf(enabledOptions[enabledOptions.length - 1]),
      );
    } else if (event.key === "Enter" && activeOption) {
      event.preventDefault();
      choose(activeOption);
    } else if (event.key === "Tab") {
      tabbingAwayRef.current = true;
      triggerRef.current?.focus();
      setOpen(false);
      setQuery("");
      setActiveIndex(0);
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
          if (nextOpen) {
            setActiveIndex(
              Math.max(0, options.findIndex((option) => option.value === value)),
            );
          }
          if (!nextOpen) {
            setQuery("");
            setActiveIndex(0);
          }
        }}
        open={open}
      >
        <Popover.Trigger asChild>
          <button
            aria-controls={listboxId}
            aria-describedby={ariaDescribedBy}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-invalid={ariaInvalid}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-required={ariaRequired ?? required}
            className={cn(
              "flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-md border border-input bg-card px-3 py-2 text-left shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
              className,
            )}
            disabled={disabled}
            data-invalid={ariaInvalid === true || ariaInvalid === "true"}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex(
                  Math.max(0, options.findIndex((option) => option.value === value)),
                );
                setOpen(true);
              }
            }}
            ref={triggerRef}
            role={triggerRole}
            type="button"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">
                {selectedOption?.label ?? placeholder}
              </span>
              {selectedOption?.description ? (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {selectedOption.description}
                </span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {selectedOption?.meta}
              <ChevronsUpDown aria-hidden="true" size={15} />
            </span>
          </button>
        </Popover.Trigger>
        <Popover.Portal container={portalContainer ?? undefined}>
          <Popover.Content
            align="start"
            className={cn("z-[90] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1rem)] rounded-md border border-border bg-card p-1 shadow-lg", contentClassName)}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              searchRef.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              if (tabbingAwayRef.current) {
                event.preventDefault();
                tabbingAwayRef.current = false;
              }
            }}
            onEscapeKeyDown={(event) => event.stopPropagation()}
            sideOffset={4}
          >
            <label className="relative block">
              <span className="sr-only" id={searchLabelId}>
                {ariaLabelledBy ? "Search" : `Search ${ariaLabel}`}
              </span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
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
                aria-describedby={ariaDescribedBy}
                aria-invalid={ariaInvalid}
                aria-labelledby={
                  ariaLabelledBy ? `${searchLabelId} ${ariaLabelledBy}` : undefined
                }
                className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring"
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
                <p className="px-3 py-3 text-sm text-muted-foreground" role="status">
                  No matching options.
                </p>
              ) : (
                visibleOptions.map((option, index) => (
                  <button
                    aria-selected={option.value === value}
                    className={cn(
                      "flex min-h-11 w-full min-w-0 items-center gap-3 rounded px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted disabled:pointer-events-none disabled:opacity-50",
                      activeOption?.value === option.value && "bg-muted",
                    )}
                    disabled={disabled || option.disabled}
                    id={`${listboxId}-${encodeURIComponent(option.value)}`}
                    key={option.value}
                    onClick={() => choose(option)}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                    tabIndex={-1}
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm font-semibold", wrapOptions ? "whitespace-normal break-words" : "truncate")}>
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {option.meta ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {option.meta}
                      </span>
                    ) : null}
                    {option.value === value ? (
                      <Check aria-hidden="true" className="shrink-0 text-primary" size={15} />
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
