"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { getWorkspaceSearchActions } from "@/features/workspace-search/workspace-search.scopes";
import {
  WORKSPACE_SEARCH_MIN_QUERY_LENGTH,
  WORKSPACE_SEARCH_RESULT_LIMIT,
  type WorkspaceSearchResult,
  type WorkspaceSearchResultKind,
} from "@/features/workspace-search/workspace-search.types";
import type { WorkspaceRole } from "@/lib/auth/context";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 150;
const SEARCH_QUERY_MAX_LENGTH = 120;

const RESULT_GROUPS = [
  { kinds: ["action"], label: "Navigation" },
  { kinds: ["property"], label: "Properties" },
  { kinds: ["unit"], label: "Units" },
  { kinds: ["person"], label: "People" },
  { kinds: ["lease"], label: "Leases" },
  { kinds: ["maintenance"], label: "Maintenance" },
  { kinds: ["task"], label: "Tasks" },
  { kinds: ["document"], label: "Documents" },
] as const satisfies readonly {
  kinds: readonly WorkspaceSearchResultKind[];
  label: string;
}[];

const RESULT_KINDS = new Set<WorkspaceSearchResultKind>([
  "action",
  "document",
  "lease",
  "maintenance",
  "person",
  "property",
  "task",
  "unit",
]);

type SearchState = "idle" | "loading" | "success" | "error";

type EntityResultState = {
  query: string;
  results: WorkspaceSearchResult[];
};

type ResultGroup = {
  label: string;
  results: WorkspaceSearchResult[];
};

export function WorkspaceCommandPalette({ role }: { role: WorkspaceRole }) {
  const router = useRouter();
  const componentId = useId();
  const dialogTitleId = `${componentId}-title`;
  const listboxId = `${componentId}-results`;
  const inputId = `${componentId}-input`;
  const inputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const compositionActiveRef = useRef(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [entityState, setEntityState] = useState<EntityResultState>({
    query: "",
    results: [],
  });
  const normalizedQuery = normalizeSearchText(query);

  const localActions = useMemo(() => {
    const actions = getWorkspaceSearchActions(role);

    if (!normalizedQuery) {
      return actions;
    }

    return actions.filter((action) => {
      const searchableText = normalizeSearchText(
        [action.label, action.id, ...action.keywords].join(" "),
      );
      return searchableText.includes(normalizedQuery);
    });
  }, [normalizedQuery, role]);

  const entityResults = useMemo(
    () =>
      entityState.query === normalizedQuery
        ? entityState.results.filter((result) =>
            isPermittedEntityResult(role, result),
          )
        : [],
    [entityState, normalizedQuery, role],
  );
  const groups = useMemo(
    () => groupResults([...localActions, ...entityResults]),
    [entityResults, localActions],
  );
  const orderedResults = useMemo(
    () => groups.flatMap((group) => group.results),
    [groups],
  );
  const resolvedActiveIndex =
    orderedResults.length === 0
      ? -1
      : activeIndex < 0 || activeIndex >= orderedResults.length
        ? 0
        : activeIndex;
  const activeResult = orderedResults[resolvedActiveIndex];
  const activeOptionId = activeResult
    ? getOptionId(componentId, activeResult, resolvedActiveIndex)
    : undefined;

  useEffect(() => {
    function handleDocumentKeyDown(event: KeyboardEvent) {
      const isComposing =
        compositionActiveRef.current || isComposingKeyboardEvent(event);

      const opensPalette =
        event.key.toLowerCase() === "k" &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey;

      if (opensPalette) {
        if (isComposing) {
          return;
        }

        event.preventDefault();
        if (!isOpen) {
          previouslyFocusedRef.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : triggerRef.current;
          setIsOpen(true);
        }
        return;
      }

      if (!isOpen) {
        return;
      }

      if (event.key === "Escape") {
        if (isComposing) {
          return;
        }

        event.preventDefault();
        closePalette();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      event.preventDefault();
      const moveToClose = document.activeElement === inputRef.current;

      if (moveToClose) {
        closeButtonRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      const previouslyFocused = previouslyFocusedRef.current;

      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }

      previouslyFocusedRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const sequence = ++requestSequenceRef.current;
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;

    if (Array.from(normalizedQuery).length < WORKSPACE_SEARCH_MIN_QUERY_LENGTH) {
      return;
    }

    const controller = new AbortController();
    activeRequestRef.current = controller;
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/workspace-search?q=${encodeURIComponent(normalizedQuery)}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error("Search unavailable");
        }

        const payload: unknown = await response.json();
        const results = parseEntityResults(payload, role);

        if (controller.signal.aborted || sequence !== requestSequenceRef.current) {
          return;
        }

        setEntityState({ query: normalizedQuery, results });
        setSearchState("success");
      } catch {
        if (controller.signal.aborted || sequence !== requestSequenceRef.current) {
          return;
        }

        setEntityState({ query: normalizedQuery, results: [] });
        setSearchState("error");
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isOpen, normalizedQuery, role]);

  useEffect(() => {
    if (!isOpen || !activeOptionId) {
      return;
    }

    document
      .getElementById(activeOptionId)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeOptionId, isOpen]);

  function openFromTrigger() {
    previouslyFocusedRef.current = triggerRef.current;
    setIsOpen(true);
  }

  function closePalette() {
    requestSequenceRef.current += 1;
    activeRequestRef.current?.abort();
    compositionActiveRef.current = false;
    setIsOpen(false);
    setQuery("");
    setActiveIndex(0);
    setSearchState("idle");
    setEntityState({ query: "", results: [] });
  }

  function activateResult(result: WorkspaceSearchResult | undefined) {
    if (!result || !isSafeRelativeHref(result.href)) {
      return;
    }

    closePalette();
    router.push(result.href);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (
      compositionActiveRef.current ||
      isComposingKeyboardEvent(event) ||
      isComposingKeyboardEvent(event.nativeEvent)
    ) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(() =>
        orderedResults.length === 0
          ? -1
          : (resolvedActiveIndex + 1) % orderedResults.length,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(() =>
        orderedResults.length === 0
          ? -1
          : (resolvedActiveIndex - 1 + orderedResults.length) %
            orderedResults.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      activateResult(activeResult);
    }
  }

  const statusMessage = getStatusMessage({
    isShortQuery:
      normalizedQuery.length > 0 &&
      Array.from(normalizedQuery).length < WORKSPACE_SEARCH_MIN_QUERY_LENGTH,
    query,
    resultCount: orderedResults.length,
    searchState,
  });

  return (
    <>
      <button
        aria-label="Search or jump"
        className="flex h-10 w-full max-w-xl items-center gap-2 rounded-md border border-border bg-surface-raised px-3 text-left text-sm text-foreground-muted shadow-sm outline-none transition-colors hover:border-accent hover:text-foreground focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring lg:h-9"
        onClick={openFromTrigger}
        ref={triggerRef}
        type="button"
      >
        <Search className="shrink-0 text-foreground-subtle" size={15} />
        <span className="min-w-0 flex-1 truncate">Search or jump…</span>
        <kbd className="hidden rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-foreground-subtle sm:inline">
          Ctrl K
        </kbd>
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-start justify-center bg-background/75 px-3 pt-[min(14vh,7rem)] backdrop-blur-[2px]"
              data-testid="workspace-command-palette-backdrop"
              onClick={(event) => {
                if (event.currentTarget === event.target) {
                  closePalette();
                }
              }}
            >
              <section
                aria-labelledby={dialogTitleId}
                aria-modal="true"
                className="flex max-h-[min(72vh,620px)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl"
                role="dialog"
              >
                <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-3 transition-shadow focus-within:border-accent focus-within:ring-2 focus-within:ring-focus-ring">
                  <Search className="shrink-0 text-foreground-subtle" size={17} />
                  <h2 className="sr-only" id={dialogTitleId}>
                    Search or jump
                  </h2>
                  <input
                    aria-activedescendant={activeOptionId}
                    aria-autocomplete="list"
                    aria-controls={listboxId}
                    aria-expanded="true"
                    aria-label="Search or jump"
                    autoComplete="off"
                    className="h-10 min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-foreground outline-none placeholder:text-foreground-subtle"
                    id={inputId}
                    onChange={(event) => {
                      const nextQuery = event.target.value;
                      const nextNormalizedQuery = normalizeSearchText(nextQuery);
                      setQuery(nextQuery);
                      setActiveIndex(0);
                      setEntityState({ query: nextNormalizedQuery, results: [] });
                      setSearchState(
                        Array.from(nextNormalizedQuery).length >=
                          WORKSPACE_SEARCH_MIN_QUERY_LENGTH
                          ? "loading"
                          : "idle",
                      );
                    }}
                    onCompositionEnd={() => {
                      compositionActiveRef.current = false;
                    }}
                    onCompositionStart={() => {
                      compositionActiveRef.current = true;
                    }}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Search or jump…"
                    ref={inputRef}
                    role="combobox"
                    type="search"
                    value={query}
                  />
                  <button
                    aria-label="Close search"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
                    onClick={closePalette}
                    ref={closeButtonRef}
                    type="button"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div
                  aria-label="Search results"
                  className="min-h-0 flex-1 overflow-y-auto p-2"
                  id={listboxId}
                  role="listbox"
                >
                  {groups.map((group) => {
                    const groupId = `${componentId}-group-${slugify(group.label)}`;
                    return (
                      <div
                        aria-labelledby={groupId}
                        className="py-1"
                        key={group.label}
                        role="group"
                      >
                        <p
                          className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground-subtle"
                          id={groupId}
                        >
                          {group.label}
                        </p>
                        <div className="space-y-0.5">
                          {group.results.map((result) => {
                            const resultIndex = orderedResults.indexOf(result);
                            const isActive = resultIndex === resolvedActiveIndex;
                            const optionId = getOptionId(
                              componentId,
                              result,
                              resultIndex,
                            );

                            return (
                              <div
                                aria-selected={isActive}
                                className={cn(
                                  "record-spine flex min-h-11 cursor-default items-center gap-3 rounded-md border-l-[3px] border-transparent px-3 py-2 text-sm text-foreground-muted outline-none",
                                  isActive &&
                                    "border-accent bg-accent-soft text-foreground",
                                )}
                                id={optionId}
                                key={`${result.kind}:${result.id}`}
                                onClick={() => activateResult(result)}
                                onMouseEnter={() => setActiveIndex(resultIndex)}
                                role="option"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium text-foreground">
                                    {result.label}
                                  </span>
                                  {result.meta ? (
                                    <span className="mt-0.5 block truncate text-xs text-muted">
                                      {result.meta}
                                    </span>
                                  ) : null}
                                </span>
                                <ArrowRight
                                  aria-hidden="true"
                                  className="shrink-0 text-foreground-subtle"
                                  size={14}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {groups.length === 0 && searchState !== "loading" ? (
                    <div className="px-3 py-10 text-center text-sm text-foreground-muted">
                      {searchState === "error"
                        ? "Search unavailable"
                        : statusMessage}
                    </div>
                  ) : null}
                </div>

                <div className="shrink-0 border-t border-border bg-surface px-4 py-2">
                  <p
                    aria-live={searchState === "error" ? "assertive" : "polite"}
                    className={cn(
                      "text-xs text-foreground-subtle",
                      searchState === "error" && "text-danger",
                    )}
                    role="status"
                  >
                    {statusMessage}
                  </p>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function groupResults(results: readonly WorkspaceSearchResult[]): ResultGroup[] {
  return RESULT_GROUPS.flatMap((group) => {
    const groupKinds: readonly WorkspaceSearchResultKind[] = group.kinds;
    const groupResults = results.filter((result) =>
      groupKinds.includes(result.kind),
    );

    return groupResults.length > 0
      ? [{ label: group.label, results: groupResults }]
      : [];
  });
}

function parseEntityResults(
  payload: unknown,
  role: WorkspaceRole,
): WorkspaceSearchResult[] {
  if (!isObject(payload) || !Array.isArray(payload.results)) {
    throw new Error("Invalid search response");
  }

  const seen = new Set<string>();
  const results: WorkspaceSearchResult[] = [];
  const candidates = payload.results.slice(0, WORKSPACE_SEARCH_RESULT_LIMIT);

  for (const candidate of candidates) {
    if (
      !isWorkspaceSearchResult(candidate) ||
      candidate.kind === "action" ||
      !isPermittedEntityResult(role, candidate)
    ) {
      continue;
    }

    const key = `${candidate.kind}:${candidate.id}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(candidate);

    if (results.length === WORKSPACE_SEARCH_RESULT_LIMIT) {
      break;
    }
  }

  return results;
}

function isWorkspaceSearchResult(value: unknown): value is WorkspaceSearchResult {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.href === "string" &&
    isSafeRelativeHref(value.href) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 256 &&
    typeof value.kind === "string" &&
    RESULT_KINDS.has(value.kind as WorkspaceSearchResultKind) &&
    typeof value.label === "string" &&
    value.label.trim().length > 0 &&
    value.label.length <= 500 &&
    (value.meta === undefined ||
      (typeof value.meta === "string" && value.meta.length <= 500))
  );
}

function isSafeRelativeHref(href: string) {
  if (
    !href.startsWith("/") ||
    href.startsWith("//") ||
    href.length > 2_048 ||
    /[\\\u0000-\u001f\u007f]/u.test(href)
  ) {
    return false;
  }

  try {
    const url = new URL(href, "https://nestory.local");
    return url.origin === "https://nestory.local";
  } catch {
    return false;
  }
}

function normalizeSearchText(value: string) {
  const normalized = value
    .toWellFormed()
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase()
    .normalize("NFC");

  return Array.from(normalized).slice(0, SEARCH_QUERY_MAX_LENGTH).join("");
}

function isPermittedEntityResult(
  role: WorkspaceRole,
  result: WorkspaceSearchResult,
) {
  const pathname = getSafePathname(result.href);
  if (!pathname) {
    return false;
  }

  if (role === "member") {
    return result.kind === "task" && pathname === "/tasks";
  }

  if (role === "manager") {
    return result.kind === "maintenance" && pathname === "/maintenance";
  }

  switch (result.kind) {
    case "property":
      return pathname.startsWith("/properties/");
    case "unit":
      return pathname.startsWith("/units/");
    case "person":
      return pathname.startsWith("/people/");
    case "lease":
      return pathname === "/leases";
    case "maintenance":
      return pathname === "/maintenance";
    case "document":
      return pathname === "/documents";
    case "action":
    case "task":
      return false;
    default:
      return false;
  }
}

function getSafePathname(href: string) {
  if (!isSafeRelativeHref(href)) {
    return null;
  }

  return new URL(href, "https://nestory.local").pathname;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getOptionId(
  componentId: string,
  result: WorkspaceSearchResult,
  index: number,
) {
  return `${componentId}-option-${slugify(result.kind)}-${index}`;
}

function slugify(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, "-");
}

function getStatusMessage({
  isShortQuery,
  query,
  resultCount,
  searchState,
}: {
  isShortQuery: boolean;
  query: string;
  resultCount: number;
  searchState: SearchState;
}) {
  if (searchState === "loading") {
    return "Searching records…";
  }

  if (searchState === "error") {
    return "Search unavailable. Try again.";
  }

  if (isShortQuery) {
    if (resultCount === 0) {
      return "Type 2 characters to search records";
    }

    return `${resultCount} navigation ${resultCount === 1 ? "result" : "results"}. Type 2 characters to search records.`;
  }

  if (query.trim() && resultCount === 0) {
    return "No results";
  }

  return `${resultCount} ${resultCount === 1 ? "result" : "results"}`;
}

function isComposingKeyboardEvent(event: {
  isComposing?: boolean;
  keyCode?: number;
}) {
  return event.isComposing === true || event.keyCode === 229;
}
