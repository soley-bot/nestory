"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useDrawerPortalContainer } from "@/components/ui/side-drawer";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const portalContainer = useDrawerPortalContainer();
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedValue = value ?? internalValue;
  const previousValueRef = useRef(selectedValue);
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
    const normalizedQuery = (query ?? "").trim().toLocaleLowerCase();
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
    if (previousValueRef.current === selectedValue) {
      return;
    }

    previousValueRef.current = selectedValue;
    hiddenInputRef.current?.dispatchEvent(
      new Event("input", { bubbles: true }),
    );
  }, [selectedValue]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setActiveIndex(
        Math.max(0, visibleOptions.findIndex((option) => option.id === selectedValue)),
      );
    } else {
      setQuery(null);
    }
  }

  function choose(nextValue: string) {
    if (disabled || inputRef.current?.matches(":disabled")) {
      return;
    }
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
    inputRef.current?.focus();
    setOpen(false);
    setQuery(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        handleOpenChange(true);
        return;
      }
      setOpen(true);
      setActiveIndex((current) => {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        return Math.max(
          0,
          Math.min(visibleOptions.length - 1, current + direction),
        );
      });
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (activeOption) {
        choose(activeOption.id);
      }
    }
  }

  const listbox = open ? (
    <div
      aria-label={
        context
          ? `${context} person options`
          : `${roles.join(" or ")} person options`
      }
      className="z-[80] max-h-[min(280px,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-md border border-border bg-card p-1 shadow-lg"
      id={listboxId}
      role="listbox"
    >
      {visibleOptions.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          No matching people.
        </p>
      ) : (
        visibleOptions.map((option, index) => (
          <button
            aria-selected={option.id === selectedValue}
            className={cn(
              "flex min-h-11 w-full min-w-0 items-center gap-3 rounded px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted",
              option.id === activeOption?.id && "bg-muted",
            )}
            id={getOptionId(listboxId, option.id)}
            disabled={disabled}
            key={option.id}
            onClick={() => choose(option.id)}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(index)}
            role="option"
            tabIndex={-1}
            type="button"
          >
            <span className="min-w-0 flex-1">
              <span className="block whitespace-normal [overflow-wrap:anywhere] text-sm font-medium text-foreground">
                {option.label}
              </span>
              <span className="mt-0.5 block whitespace-normal [overflow-wrap:anywhere] text-xs text-muted-foreground">
                {option.description}
              </span>
            </span>
            {option.id === selectedValue ? (
              <Check aria-hidden="true" className="shrink-0 text-primary" size={15} />
            ) : null}
          </button>
        ))
      )}
    </div>
  ) : null;

  return (
    <Popover.Root onOpenChange={handleOpenChange} open={open}>
      <div className={cn("relative", className)} ref={rootRef}>
        <input
          name={name}
          ref={hiddenInputRef}
          type="hidden"
          value={selectedValue === externalValue ? "" : selectedValue}
        />
        <Popover.Anchor asChild>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
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
                "h-8 w-full rounded-lg border border-input bg-card pl-9 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
                allowClear && selectedOption ? "pr-16" : "pr-9",
              )}
              disabled={disabled}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActiveIndex(0);
                setOpen(true);
              }}
              onClick={() => {
                if (!open) handleOpenChange(true);
              }}
              onFocus={() => handleOpenChange(true)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              ref={inputRef}
              role="combobox"
              value={open && query !== null ? query : selectedOption?.label ?? ""}
            />
            <ChevronsUpDown
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={15}
            />
            {allowClear && selectedOption ? (
              <button
                aria-label={`Clear ${context ?? "selected person"}`}
                className="absolute right-8 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={disabled}
                onClick={() => choose("")}
                type="button"
              >
                <X aria-hidden="true" size={14} />
              </button>
            ) : null}
          </div>
        </Popover.Anchor>
        <Popover.Portal container={portalContainer ?? undefined}>
          <Popover.Content
            align="start"
            asChild
            onCloseAutoFocus={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => event.stopPropagation()}
            onInteractOutside={(event) => {
              if (rootRef.current?.contains(event.detail.originalEvent.target as Node)) {
                event.preventDefault();
              }
            }}
            onOpenAutoFocus={(event) => event.preventDefault()}
            sideOffset={4}
          >
            {listbox}
          </Popover.Content>
        </Popover.Portal>
      </div>
    </Popover.Root>
  );
}

export const PERSON_SELECT_EXTERNAL_VALUE = externalValue;

function getOptionId(listboxId: string, optionId: string) {
  return `${listboxId}-option-${encodeURIComponent(optionId)}`;
}
