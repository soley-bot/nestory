import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { SelectControl, type SelectControlOption } from "@/components/ui/select-control";
import { cn } from "@/lib/utils";

export type SearchComboSuggestion = {
  description?: string;
  id: string;
  label: string;
  meta?: string;
};

type SearchComboProps = {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onQueryChange?: (value: string) => void;
  onScopeChange?: (value: string) => void;
  onSuggestionSelect?: (suggestion: SearchComboSuggestion) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
  query: string;
  scopeOptions?: SelectControlOption[];
  scopeValue?: string;
  submitLabel: string;
  suggestions?: SearchComboSuggestion[];
};

export function SearchCombo({
  ariaLabel,
  className,
  disabled = false,
  onQueryChange,
  onScopeChange,
  onSuggestionSelect,
  onSubmit,
  placeholder,
  query,
  scopeOptions = [],
  scopeValue = "all",
  submitLabel,
  suggestions = [],
}: SearchComboProps) {
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const hasScope = scopeOptions.length > 1;
  const hasSuggestions =
    suggestionsOpen && suggestions.length > 0 && Boolean(onSuggestionSelect);

  return (
    <form
      className={cn("flex min-w-0 flex-1 gap-1.5", className)}
      onSubmit={onSubmit}
    >
      <div className="relative min-w-0 flex-1">
        <div className="flex min-w-0 overflow-hidden rounded-md border border-control-border bg-surface shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-focus-ring">
          {hasScope ? (
            <SelectControl
              ariaLabel={`${ariaLabel} scope`}
              className="h-8 w-[118px] rounded-none border-0 border-r border-border bg-surface-muted px-2 shadow-none focus:border-transparent focus:ring-0 sm:w-[132px]"
              onValueChange={onScopeChange}
              options={scopeOptions}
              value={scopeValue}
            />
          ) : null}
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{ariaLabel}</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            size={16}
          />
          <SearchInput
            className="h-8 rounded-none border-0 bg-transparent pl-9 shadow-none focus:border-transparent focus:ring-0"
            onBlur={() => setSuggestionsOpen(false)}
            onChange={(event) => {
              setSuggestionsOpen(true);
              onQueryChange?.(event.currentTarget.value);
            }}
            onFocus={() => setSuggestionsOpen(true)}
            placeholder={placeholder}
            value={query}
          />
        </label>
        </div>
        {hasSuggestions ? (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-md border border-border bg-surface p-1 shadow-lg">
            {suggestions.map((suggestion) => (
              <button
                className="flex min-h-10 w-full min-w-0 items-center justify-between gap-3 rounded px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
                key={suggestion.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setSuggestionsOpen(false);
                  onSuggestionSelect?.(suggestion);
                }}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {suggestion.label}
                  </span>
                  {suggestion.description ? (
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {suggestion.description}
                    </span>
                  ) : null}
                </span>
                {suggestion.meta ? (
                  <span className="shrink-0 text-xs font-medium text-muted">
                    {suggestion.meta}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <Button
        aria-label={submitLabel}
        className="h-8 w-8 shrink-0 px-0"
        disabled={disabled}
        title={submitLabel}
        type="submit"
      >
        <Search size={14} />
      </Button>
    </form>
  );
}
