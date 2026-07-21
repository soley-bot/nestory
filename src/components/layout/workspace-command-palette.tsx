"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  CheckSquare2,
  FileKey2,
  FileText,
  LayoutGrid,
  Search,
  UserRound,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  getWorkspaceSearchActions,
  type WorkspaceSearchAction,
} from "@/features/workspace-search/workspace-search.scopes";
import {
  WORKSPACE_SEARCH_MIN_QUERY_LENGTH,
  WORKSPACE_SEARCH_RESULT_LIMIT,
  type WorkspaceSearchResult,
  type WorkspaceSearchResultKind,
} from "@/features/workspace-search/workspace-search.types";
import type { WorkspaceRole } from "@/lib/auth/context";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 500;
const SEARCH_QUERY_MAX_LENGTH = 120;
const MAX_VISIBLE_RESULTS = 8;
const MAX_PAGE_RESULTS = 3;

const RESULT_GROUPS = [
  {
    kinds: [
      "property",
      "unit",
      "person",
      "lease",
      "maintenance",
      "task",
      "document",
    ],
    label: "Best matches",
  },
  { kinds: ["action"], label: "Pages" },
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

const RESULT_KIND_PRESENTATION: Record<
  WorkspaceSearchResultKind,
  { icon: LucideIcon; label: string }
> = {
  action: { icon: LayoutGrid, label: "Page" },
  document: { icon: FileText, label: "Document" },
  lease: { icon: FileKey2, label: "Lease" },
  maintenance: { icon: Wrench, label: "Case" },
  person: { icon: UserRound, label: "Person" },
  property: { icon: Building2, label: "Property" },
  task: { icon: CheckSquare2, label: "Task" },
  unit: { icon: LayoutGrid, label: "Unit" },
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
  const isPageMode = normalizedQuery.startsWith(">");
  const pageQuery = isPageMode
    ? normalizeSearchText(normalizedQuery.slice(1))
    : normalizedQuery;
  const isRecordQuery =
    !isPageMode &&
    Array.from(normalizedQuery).length >= WORKSPACE_SEARCH_MIN_QUERY_LENGTH;
  const isShortRecordQuery =
    normalizedQuery.length > 0 && !isPageMode && !isRecordQuery;

  const localActions = useMemo(() => {
    const actions = getWorkspaceSearchActions(role);

    if (!normalizedQuery) {
      return getQuickAccessActions(actions, role);
    }

    if (!isPageMode && !isRecordQuery) {
      return [];
    }

    return rankPageActions(actions, pageQuery).slice(
      0,
      isPageMode ? MAX_VISIBLE_RESULTS : MAX_PAGE_RESULTS,
    );
  }, [isPageMode, isRecordQuery, normalizedQuery, pageQuery, role]);

  const entityResults = useMemo(
    () =>
      entityState.query === normalizedQuery
        ? entityState.results.filter((result) =>
            isPermittedEntityResult(role, result),
          )
        : [],
    [entityState, normalizedQuery, role],
  );
  const availableResults = useMemo(
    () => (isPageMode ? localActions : [...entityResults, ...localActions]),
    [entityResults, isPageMode, localActions],
  );
  const groups = useMemo(() => {
    if (!normalizedQuery) {
      return localActions.length > 0
        ? [{ label: "Quick access", results: localActions }]
        : [];
    }

    return limitResultGroups(
      groupResults(availableResults),
      MAX_VISIBLE_RESULTS,
    );
  }, [availableResults, localActions, normalizedQuery]);
  const orderedResults = useMemo(
    () => groups.flatMap((group) => group.results),
    [groups],
  );
  const availableResultCount = availableResults.length;
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
      const key = typeof event.key === "string" ? event.key : "";
      const isComposing =
        compositionActiveRef.current || isComposingKeyboardEvent(event);

      const opensPalette =
        key.toLowerCase() === "k" &&
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

      if (key === "Escape") {
        if (isComposing) {
          return;
        }

        event.preventDefault();
        closePalette();
        return;
      }

      if (key !== "Tab") {
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

    if (!isRecordQuery) {
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
  }, [isOpen, isRecordQuery, normalizedQuery, role]);

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
    availableResultCount,
    isPageMode,
    isShortQuery: isShortRecordQuery,
    query,
    visibleResultCount: orderedResults.length,
    searchState,
  });

  return (
    <>
      <button
        aria-label="Search or jump"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-foreground-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
        onClick={openFromTrigger}
        ref={triggerRef}
        type="button"
      >
        <Search aria-hidden="true" size={16} />
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-start justify-center bg-background/70 px-3 pt-[min(11vh,5.5rem)] backdrop-blur-[2px]"
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
                className="flex max-h-[min(72vh,32rem)] w-full max-w-[38rem] flex-col overflow-hidden rounded-xl border border-border bg-surface-raised shadow-xl"
                role="dialog"
              >
                <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-2.5 transition-shadow focus-within:border-accent focus-within:ring-2 focus-within:ring-focus-ring">
                  <Search className="shrink-0 text-foreground-subtle" size={18} />
                  <h2 className="sr-only" id={dialogTitleId}>
                    Search or jump
                  </h2>
                  {isPageMode ? (
                    <span className="shrink-0 rounded-md bg-surface-muted px-2 py-1 text-xs font-semibold text-foreground-muted">
                      Pages
                    </span>
                  ) : null}
                  <input
                    aria-activedescendant={activeOptionId}
                    aria-autocomplete="list"
                    aria-controls={listboxId}
                    aria-expanded="true"
                    aria-label="Search or jump"
                    autoComplete="off"
                    className="h-10 min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] text-foreground outline-none placeholder:text-foreground-subtle"
                    id={inputId}
                    onChange={(event) => {
                      const nextQuery = event.target.value;
                      const nextNormalizedQuery = normalizeSearchText(nextQuery);
                      const nextIsPageMode = nextNormalizedQuery.startsWith(">");
                      setQuery(nextQuery);
                      setActiveIndex(0);
                      setEntityState({ query: nextNormalizedQuery, results: [] });
                      setSearchState(
                        !nextIsPageMode &&
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
                    placeholder="Search properties, units, people…"
                    ref={inputRef}
                    role="combobox"
                    type="search"
                    value={query}
                  />
                  <button
                    aria-label="Close search"
                    className="grid h-8 shrink-0 place-items-center rounded-md px-2 text-foreground-subtle outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
                    onClick={closePalette}
                    ref={closeButtonRef}
                    type="button"
                  >
                    <span className="hidden text-[11px] font-medium sm:inline">Esc</span>
                    <X className="sm:hidden" size={16} />
                  </button>
                </div>

                <div
                  aria-label="Search results"
                  className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5"
                  id={listboxId}
                  role="listbox"
                >
                  {groups.map((group) => {
                    const groupId = `${componentId}-group-${slugify(group.label)}`;
                    return (
                      <div
                        aria-labelledby={groupId}
                        className="py-1.5"
                        key={group.label}
                        role="group"
                      >
                        <p
                          className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground-subtle"
                          id={groupId}
                        >
                          {group.label}
                        </p>
                        <div className="space-y-0.5">
                          {group.results.map((result) => {
                            const resultIndex = orderedResults.indexOf(result);
                            const isActive = resultIndex === resolvedActiveIndex;
                            const presentation = RESULT_KIND_PRESENTATION[result.kind];
                            const ResultIcon = presentation.icon;
                            const optionId = getOptionId(
                              componentId,
                              result,
                              resultIndex,
                            );

                            return (
                              <div
                                aria-selected={isActive}
                                className={cn(
                                  "record-spine flex min-h-12 cursor-default items-center gap-3 rounded-lg border-l-2 border-transparent px-2.5 py-2 text-sm text-foreground-muted outline-none transition-colors",
                                  isActive &&
                                    "border-accent bg-surface-muted text-foreground",
                                )}
                                id={optionId}
                                key={`${result.kind}:${result.id}`}
                                onClick={() => activateResult(result)}
                                onMouseEnter={() => setActiveIndex(resultIndex)}
                                role="option"
                              >
                                <span
                                  className={cn(
                                    "grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-surface text-foreground-subtle",
                                    isActive && "text-accent",
                                  )}
                                >
                                  <ResultIcon aria-hidden="true" size={15} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium text-foreground">
                                    {result.label}
                                  </span>
                                  <span className="mt-0.5 block truncate text-xs text-muted">
                                    {presentation.label}
                                    {result.kind !== "action" && result.meta
                                      ? ` · ${result.meta}`
                                      : ""}
                                  </span>
                                </span>
                                {isActive ? (
                                  <kbd
                                    aria-hidden="true"
                                    className="hidden shrink-0 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-foreground-subtle sm:inline"
                                  >
                                    Enter
                                  </kbd>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {groups.length === 0 ? (
                    <div className="px-4 py-9 text-center">
                      <p className="text-sm font-medium text-foreground">
                        {searchState === "loading"
                          ? "Searching records…"
                          : searchState === "error"
                            ? "Search unavailable"
                            : normalizedQuery
                              ? statusMessage
                              : "Find a workspace record"}
                      </p>
                      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-foreground-subtle">
                        {searchState === "error"
                          ? "Check your connection and try again."
                          : isShortRecordQuery
                            ? "Add one more character to search workspace records."
                            : normalizedQuery
                              ? "Try a more specific name, code, payer, or reference."
                              : "Search across properties, units, people, leases, tasks, and documents."}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-3.5 py-2">
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
                  <div
                    aria-hidden="true"
                    className="hidden items-center gap-2 text-[11px] text-foreground-subtle sm:flex"
                  >
                    <span><kbd className="font-medium">↑↓</kbd> Navigate</span>
                    <span><kbd className="font-medium">Enter</kbd> Open</span>
                    <span><kbd className="font-medium">&gt;</kbd> Pages</span>
                  </div>
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

function getQuickAccessActions(
  actions: readonly WorkspaceSearchAction[],
  role: WorkspaceRole,
) {
  const preferredIds =
    role === "admin"
      ? [
          "action:properties",
          "action:people",
          "action:rent-income",
          "action:maintenance",
        ]
      : role === "manager"
        ? ["action:maintenance", "action:tasks"]
        : ["action:tasks"];
  const preferred = preferredIds.flatMap((id) => {
    const action = actions.find((candidate) => candidate.id === id);
    return action ? [action] : [];
  });

  return preferred.length > 0 ? preferred : actions.slice(0, 4);
}

function rankPageActions(
  actions: readonly WorkspaceSearchAction[],
  query: string,
) {
  if (!query) {
    return [...actions];
  }

  return actions
    .map((action, index) => {
      const label = normalizeSearchText(action.label);
      const keywords = action.keywords.map(normalizeSearchText);
      const id = normalizeSearchText(action.id.replace(/^action:/u, ""));
      const searchableText = [label, id, ...keywords].join(" ");

      if (!searchableText.includes(query)) {
        return null;
      }

      const score =
        label === query
          ? 0
          : label.startsWith(query)
            ? 1
            : keywords.some((keyword) => keyword.startsWith(query))
              ? 2
              : 3;

      return { action, index, score };
    })
    .filter(
      (candidate): candidate is {
        action: WorkspaceSearchAction;
        index: number;
        score: number;
      } => candidate !== null,
    )
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ action }) => action);
}

function limitResultGroups(groups: readonly ResultGroup[], limit: number) {
  let remaining = limit;

  return groups.flatMap((group) => {
    if (remaining === 0) {
      return [];
    }

    const results = group.results.slice(0, remaining);
    remaining -= results.length;
    return results.length > 0 ? [{ ...group, results }] : [];
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
  availableResultCount,
  isPageMode,
  isShortQuery,
  query,
  visibleResultCount,
  searchState,
}: {
  availableResultCount: number;
  isPageMode: boolean;
  isShortQuery: boolean;
  query: string;
  visibleResultCount: number;
  searchState: SearchState;
}) {
  if (searchState === "loading") {
    return "Searching records…";
  }

  if (searchState === "error") {
    return "Search unavailable. Try again.";
  }

  if (isShortQuery) {
    return "Type 2 characters to search records";
  }

  if (!query.trim()) {
    return "Type to search · Use > to jump to a page";
  }

  if (query.trim() && visibleResultCount === 0) {
    return "No results";
  }

  if (availableResultCount > visibleResultCount) {
    return `Showing ${visibleResultCount} of ${availableResultCount} results`;
  }

  const noun = isPageMode ? "page" : "result";
  return `${visibleResultCount} ${visibleResultCount === 1 ? noun : `${noun}s`}`;
}

function isComposingKeyboardEvent(event: {
  isComposing?: boolean;
  keyCode?: number;
}) {
  return event.isComposing === true || event.keyCode === 229;
}
