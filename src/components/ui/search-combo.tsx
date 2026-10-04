import { useId, useRef, useState, type FormEvent } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import {
  SelectControl,
  type SelectControlOption,
} from "@/components/ui/select-control";
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
  onCompositionChange?: (composing: boolean) => void;
  onScopeChange?: (value: string) => void;
  onSuggestionSelect?: (suggestion: SearchComboSuggestion) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
  query: string;
  scopeOptions?: SelectControlOption[];
  scopeValue?: string;
  showSubmitButton?: boolean;
  submitLabel: string;
  suggestions?: SearchComboSuggestion[];
};

export function SearchCombo({
  ariaLabel,
  className,
  disabled = false,
  onQueryChange,
  onCompositionChange,
  onScopeChange,
  onSuggestionSelect,
  onSubmit,
  placeholder,
  query,
  scopeOptions = [],
  scopeValue = "all",
  showSubmitButton = true,
  submitLabel,
  suggestions = [],
}: SearchComboProps) {
  const listboxId = useId();
  const composing = useRef(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null);
  const hasScope = scopeOptions.length > 1;
  const hasSuggestions =
    suggestionsOpen && suggestions.length > 0 && Boolean(onSuggestionSelect);
  const activeSuggestion = hasSuggestions
    ? suggestions.find(suggestion => suggestion.id === activeSuggestionId)
    : undefined;

  function selectSuggestion(suggestion: SearchComboSuggestion) {
    setSuggestionsOpen(false);
    setActiveSuggestionId(null);
    onSuggestionSelect?.(suggestion);
  }

  return (
    <form
      className={cn("flex min-w-0 flex-1 basis-full gap-1.5 sm:basis-[20rem]", className)}
      onSubmit={onSubmit}
      role="search"
      aria-label={ariaLabel}
      aria-busy={disabled}
    >
      <div className="relative min-w-0 flex-1">
        <div className="flex min-w-0 overflow-hidden rounded-md border border-input bg-card shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
          {hasScope ? (
            <SelectControl
              ariaLabel={`${ariaLabel} scope`}
              className="h-8 w-[118px] shrink-0 rounded-none border-0 border-r border-border bg-muted px-2 shadow-none focus:border-transparent focus:ring-0 sm:w-[132px]"
              onValueChange={onScopeChange}
              options={scopeOptions}
              value={scopeValue}
            />
          ) : null}
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{ariaLabel}</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={16}
            />
            <SearchInput
              aria-activedescendant={activeSuggestion ? `${listboxId}-${encodeURIComponent(activeSuggestion.id)}` : undefined}
              aria-autocomplete={onSuggestionSelect ? "list" : undefined}
              aria-controls={hasSuggestions ? listboxId : undefined}
              aria-expanded={onSuggestionSelect ? hasSuggestions : undefined}
              aria-haspopup={onSuggestionSelect ? "listbox" : undefined}
              role={onSuggestionSelect ? "combobox" : undefined}
              onCompositionStart={() => { composing.current = true; onCompositionChange?.(true); }}
              onCompositionEnd={() => { composing.current = false; onCompositionChange?.(false); }}
              className="h-8 rounded-none border-0 bg-transparent pl-9 shadow-none focus:border-transparent focus:ring-0"
              onBlur={() => { setSuggestionsOpen(false); setActiveSuggestionId(null); }}
              onChange={(event) => {
                setSuggestionsOpen(true);
                setActiveSuggestionId(null);
                onQueryChange?.(event.currentTarget.value);
              }}
              onFocus={() => setSuggestionsOpen(true)}
              onKeyDown={event => {
                if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
                if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length && onSuggestionSelect) {
                  event.preventDefault();
                  const index = suggestions.findIndex(suggestion => suggestion.id === activeSuggestion?.id);
                  const next = index < 0
                    ? event.key === "ArrowDown" ? 0 : suggestions.length - 1
                    : Math.max(0, Math.min(suggestions.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
                  setSuggestionsOpen(true);
                  setActiveSuggestionId(suggestions[next].id);
                } else if (event.key === "Enter" && activeSuggestion) {
                  event.preventDefault();
                  selectSuggestion(activeSuggestion);
                } else if (event.key === "Escape" && hasSuggestions) {
                  event.preventDefault();
                  setSuggestionsOpen(false);
                  setActiveSuggestionId(null);
                }
              }}
              placeholder={placeholder}
              value={query}
            />
          </label>
          {query && onQueryChange ? (
            <button
              aria-label={`Clear ${ariaLabel.toLowerCase()}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => { setSuggestionsOpen(false); setActiveSuggestionId(null); onQueryChange(""); }}
              type="button"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
        {hasSuggestions ? (
          <div aria-label={`${ariaLabel} suggestions`} id={listboxId} role="listbox" className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-[min(24rem,60vh)] overflow-y-auto rounded-md border border-border bg-card p-1 shadow-lg">
            {suggestions.map((suggestion) => (
              <button
                aria-selected={suggestion.id === activeSuggestion?.id}
                className={cn("flex min-h-10 w-full min-w-0 flex-col items-start justify-between gap-1 rounded px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none sm:flex-row sm:items-center sm:gap-3", suggestion.id === activeSuggestion?.id && "bg-muted")}
                id={`${listboxId}-${encodeURIComponent(suggestion.id)}`}
                key={suggestion.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(suggestion)}
                onMouseEnter={() => setActiveSuggestionId(suggestion.id)}
                role="option"
                tabIndex={-1}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block whitespace-normal font-medium text-foreground [overflow-wrap:anywhere]">
                    {suggestion.label}
                  </span>
                  {suggestion.description ? (
                    <span className="mt-0.5 block whitespace-normal text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {suggestion.description}
                    </span>
                  ) : null}
                </span>
                {suggestion.meta ? (
                  <span className="max-w-full text-xs font-medium text-muted-foreground [overflow-wrap:anywhere] sm:shrink-0">
                    {suggestion.meta}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {showSubmitButton ? (
        <Button
          aria-label={submitLabel}
          className="h-8 w-8 shrink-0 px-0"
          disabled={disabled}
          title={submitLabel}
          type="submit"
        >
          <Search size={14} />
        </Button>
      ) : null}
    </form>
  );
}
