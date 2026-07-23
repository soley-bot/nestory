"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import type { PersonSelectOption } from "@/features/people/person-select";
import type { PersonRoleValue } from "@/features/people/people.types";
import { cn } from "@/lib/utils";

const externalValue = "external";

type PersonSelectProps = {
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true";
  "aria-labelledby"?: string;
  "aria-required"?: boolean | "false" | "true";
  allowClear?: boolean;
  allowExternal?: boolean;
  className?: string;
  context?: string;
  defaultValue?: string;
  disabled?: boolean;
  externalDescription?: string;
  externalLabel?: string;
  includeArchived?: boolean;
  name: string;
  onValueChange?: (value: string) => void;
  options: PersonSelectOption[];
  placeholder?: string;
  preservedOption?: PersonSelectOption;
  roles: PersonRoleValue[];
  value?: string;
};

export function PersonSelect({
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledBy,
  "aria-required": ariaRequired,
  allowClear = false,
  allowExternal = false,
  className,
  context,
  defaultValue = "",
  disabled = false,
  externalDescription = "Use a manually entered payer snapshot",
  externalLabel = "External payer",
  includeArchived = false,
  name,
  onValueChange,
  options,
  placeholder = "Choose a person",
  preservedOption,
  roles,
  value,
}: PersonSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedValue = value ?? internalValue;
  const normalizedOptions = useMemo(() => {
    const next = options.filter((option) => includeArchived || !option.archived);
    if (
      preservedOption &&
      selectedValue === preservedOption.id &&
      !next.some((option) => option.id === preservedOption.id)
    ) {
      next.push(preservedOption);
    }
    return next;
  }, [includeArchived, options, preservedOption, selectedValue]);
  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const candidates = allowExternal
      ? [
          ...normalizedOptions,
          {
            archived: false,
            description: externalDescription,
            id: externalValue,
            label: externalLabel,
            roles: [] as PersonRoleValue[],
          },
        ]
      : normalizedOptions;

    if (!normalizedQuery) {
      return candidates;
    }

    return candidates.filter((option) =>
      `${option.label} ${option.description}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [
    allowExternal,
    externalDescription,
    externalLabel,
    normalizedOptions,
    query,
  ]);
  const selectedOption =
    normalizedOptions.find((option) => option.id === selectedValue) ??
    (selectedValue === externalValue && allowExternal
      ? {
          archived: false,
          description: externalDescription,
          id: externalValue,
          label: externalLabel,
          roles: [] as PersonRoleValue[],
        }
      : null);
  const activeOption = visibleOptions[activeIndex] ?? visibleOptions[0];
  const activeOptionId =
    open && activeOption
      ? getOptionId(listboxId, activeOption.id)
      : undefined;

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function choose(nextValue: string) {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        return Math.max(
          0,
          Math.min(visibleOptions.length - 1, current + direction),
        );
      });
    } else if (event.key === "Enter" && open && activeOption) {
      event.preventDefault();
      choose(activeOption.id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      <input
        name={name}
        type="hidden"
        value={selectedValue === externalValue ? "" : selectedValue}
      />
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          size={15}
        />
        <input
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-controls={listboxId}
          aria-describedby={ariaDescribedBy}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel ?? context ?? "Choose a person"}
          aria-labelledby={ariaLabelledBy}
          aria-required={ariaRequired}
          className={cn(
            "h-9 w-full rounded-md border border-control-border bg-surface pl-9 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60",
            allowClear && selectedOption ? "pr-16" : "pr-9",
          )}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={selectedOption && !open ? "" : placeholder}
          role="combobox"
          value={open ? query : ""}
        />
        <ChevronsUpDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          size={15}
        />
        {allowClear && selectedOption ? (
          <button
            aria-label={`Clear ${context ?? "selected person"}`}
            className="absolute right-8 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            onClick={() => choose("")}
            type="button"
          >
            <X aria-hidden="true" size={14} />
          </button>
        ) : null}
      </div>
      {selectedOption && !open ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-9 flex min-w-0 items-center",
            allowClear ? "right-16" : "right-9",
          )}
        >
          <span className="truncate text-sm text-foreground">
            {selectedOption.label}
          </span>
        </div>
      ) : null}
      {open ? (
        <div
          aria-label={
            context
              ? `${context} person options`
              : `${roles.join(" or ")} person options`
          }
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-lg"
          id={listboxId}
          role="listbox"
        >
          {visibleOptions.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted">No matching people.</p>
          ) : (
            visibleOptions.map((option, index) => (
              <button
                aria-selected={option.id === selectedValue}
                className={cn(
                  "flex min-h-11 w-full min-w-0 items-center gap-3 rounded px-2.5 py-2 text-left outline-none transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted",
                  option.id === activeOption?.id && "bg-surface-muted",
                )}
                id={getOptionId(listboxId, option.id)}
                key={option.id}
                onClick={() => choose(option.id)}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
                type="button"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {option.description}
                  </span>
                </span>
                {option.id === selectedValue ? (
                  <Check className="shrink-0 text-accent" size={15} />
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export const PERSON_SELECT_EXTERNAL_VALUE = externalValue;

function getOptionId(listboxId: string, optionId: string) {
  return `${listboxId}-option-${encodeURIComponent(optionId)}`;
}
