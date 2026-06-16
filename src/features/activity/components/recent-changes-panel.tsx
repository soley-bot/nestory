"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RecentChange } from "@/features/activity/activity.types";
import { formatDate } from "@/lib/dates/format";

type RecentChangesPanelProps = {
  changes: RecentChange[];
  defaultCollapsed?: boolean;
  maxVisible?: number;
  onSelectChange?: (change: RecentChange) => void;
};

export function RecentChangesPanel({
  changes,
  defaultCollapsed = false,
  maxVisible,
  onSelectChange,
}: RecentChangesPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const visibleChanges = maxVisible ? changes.slice(0, maxVisible) : changes;
  const hiddenChangeCount = Math.max(0, changes.length - visibleChanges.length);

  return (
    <section className="rounded-md border border-border bg-surface">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-2">
          <History size={16} className="text-muted" />
          <h2 className="text-sm font-semibold tracking-tight">Recent changes</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{changes.length} latest</Badge>
          <Button
            aria-expanded={!collapsed}
            className="h-8 px-2"
            onClick={() => setCollapsed((current) => !current)}
            variant="ghost"
          >
            {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            {collapsed ? "Show" : "Hide"}
          </Button>
        </div>
      </div>

      {collapsed ? null : changes.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">
          No timeline or ledger changes have been logged yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {visibleChanges.map((change) => (
            <li className="px-4 py-3 sm:px-5" key={change.id}>
              <button
                className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between"
                disabled={!onSelectChange}
                onClick={() => onSelectChange?.(change)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground sm:truncate">
                    {change.recordLabel}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {change.entityLabel} - {formatDate(change.createdAt)}
                  </span>
                </span>
                <Badge className="shrink-0" tone={change.tone}>
                  {change.actionLabel}
                </Badge>
              </button>
            </li>
          ))}
          {hiddenChangeCount > 0 ? (
            <li className="px-5 py-3 text-sm text-muted">
              {hiddenChangeCount} older changes hidden.
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
