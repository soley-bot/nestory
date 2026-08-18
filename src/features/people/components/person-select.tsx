"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
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
  const listboxRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const portalContainer = useDrawerPortalContainer();
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  const updateFloatingPosition = useCallback(() => {
    if (!portalContainer || !rootRef.current || !listboxRef.current) {
      return;
    }

    const anchorRect = rootRef.current.getBoundingClientRect();
    const containingBlock = portalContainer.parentElement ?? portalContainer;
    const containingBlockRect = containingBlock.getBoundingClientRect();
    const viewportPadding = 16;
    const listboxGap = 4;
    const spaceBelow = window.innerHeight - anchorRect.bottom - viewportPadding;
    const spaceAbove = anchorRect.top - viewportPadding;
    const placeAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    const availableSpace = placeAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(96, Math.min(280, availableSpace));

    const listbox = listboxRef.current;
    listbox.style.left = `${anchorRect.left - containingBlockRect.left}px`;
    listbox.style.maxHeight = `${maxHeight}px`;
    listbox.style.top = `${
      placeAbove
        ? anchorRect.top - containingBlockRect.top - maxHeight - listboxGap
        : anchorRect.bottom - containingBlockRect.top + listboxGap
    }px`;
    listbox.style.width = `${anchorRect.width}px`;
  }, [portalContainer]);

  useEffect(() => {
    if (previousValueRef.current === selectedValue) {
      return;
    }

    previousValueRef.current = selectedValue;
    hiddenInputRef.current?.dispatchEvent(
      new Event("input", { bubbles: true }),
    );
  }, [selectedValue]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !listboxRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useLayoutEffect(() => {
    if (!open || !portalContainer) {
      return;
    }

    updateFloatingPosition();
    window.addEventListener("resize", updateFloatingPosition);
    document.addEventListener("scroll", updateFloatingPosition, true);

    return () => {
      window.removeEventListener("resize", updateFloatingPosition);
      document.removeEventListener("scroll", updateFloatingPosition, true);
    };
  }, [open, portalContainer, updateFloatingPosition]);

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

  const listbox = open ? (
    <div
      aria-label={
        context
          ? `${context} person options`
          : `${roles.join(" or ")} person options`
      }
      className={cn(
        "z-[80] max-h-[280px] overflow-y-auto rounded-md border border-border bg-card p-1 shadow-lg",
        portalContainer
          ? "absolute"
          : "absolute left-0 right-0 top-[calc(100%+4px)]",
      )}
      id={listboxId}
      ref={listboxRef}
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
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {option.description}
              </span>
            </span>
            {option.id === selectedValue ? (
              <Check className="shrink-0 text-primary" size={15} />
            ) : null}
          </button>
        ))
      )}
    </div>
  ) : null;

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      <input
        name={name}
        ref={hiddenInputRef}
        type="hidden"
        value={selectedValue === externalValue ? "" : selectedValue}
      />
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
            // Height and radius track the shared Input and SelectControl, so a
            // person picker sitting beside either one lines up with it.
            "h-8 w-full rounded-lg border border-input bg-card pl-9 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
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
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          size={15}
        />
        {allowClear && selectedOption ? (
          <button
            aria-label={`Clear ${context ?? "selected person"}`}
            className="absolute right-8 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      {portalContainer ? createPortal(listbox, portalContainer) : listbox}
    </div>
  );
}

export const PERSON_SELECT_EXTERNAL_VALUE = externalValue;

function getOptionId(listboxId: string, optionId: string) {
  return `${listboxId}-option-${encodeURIComponent(optionId)}`;
}
