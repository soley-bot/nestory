"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bookmark, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildReportQueryParams } from "@/features/reports/reports.filters";
import type { ReportsViewQuery } from "@/features/reports/reports.types";

const changedEvent = "nestory-report-views-changed";
const preferenceKeys = new Set(["month", "propertyId", "unitId", "ownerPersonId", "dateFrom", "dateTo", "query", "transactionType", "transactionStatus", "payeeId", "groupBy", "columns", "status"]);
type SavedView = { name: string; query: string };

function preferences(query: string) {
  const result = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(query)) {
    if (preferenceKeys.has(key) && value.length <= 1000) result.set(key, value);
  }
  return result.toString();
}

function readViews(value: string): SavedView[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedView => typeof item === "object" && item !== null &&
      typeof item.name === "string" && item.name.length > 0 && item.name.length <= 60 && typeof item.query === "string")
      .slice(0, 12).map((item) => ({ name: item.name, query: preferences(item.query) }));
  } catch { return []; }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changedEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changedEvent, callback);
  };
}

export function ReportSavedViews({ storageKey, viewQuery }: { storageKey: string; viewQuery: ReportsViewQuery }) {
  const key = `nestory:report-views:v1:${storageKey}:${viewQuery.report}`;
  const snapshot = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
  }, () => "");
  const views = readViews(snapshot);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  function store(next: SavedView[]) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event(changedEvent));
      return true;
    } catch {
      setMessage("Browser storage is unavailable. This view was not saved.");
      return false;
    }
  }
  return <details className="relative">
    <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><Bookmark size={14} aria-hidden="true" />Saved views</summary>
    <div className="absolute right-0 z-30 mt-2 w-72 rounded-md border border-border bg-popover p-3 shadow-md">
      <p className="mb-3 text-xs text-muted-foreground">Saved on this browser</p>
      <form onSubmit={(event) => {
        event.preventDefault();
        const label = name.trim();
        if (!label) return;
        if (views.length >= 12 && !views.some((view) => view.name === label)) {
          setMessage("Remove a saved view before adding another (12 maximum).");
          return;
        }
        const next = { name: label, query: preferences(buildReportQueryParams(viewQuery).toString()) };
        if (store([...views.filter((view) => view.name !== label), next])) {
          setMessage(`Saved ${label}.`);
          setName("");
        }
      }} className="space-y-2">
        <label className="block text-xs font-medium" htmlFor="report-view-name">View name</label>
        <Input id="report-view-name" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} required placeholder="For example, monthly fees" />
        <Button size="sm" type="submit" variant="outline">Save current view</Button>
      </form>
      {message ? <p role="status" className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
      <ul aria-label="Saved report views" className="mt-3 divide-y divide-border border-t border-border">
        {views.map((view) => <li className="flex items-center gap-2 py-1" key={view.name}>
          <Link className="min-w-0 flex-1 truncate py-1 text-sm font-medium hover:underline" href={`/reports/${viewQuery.report}?${view.query}`}>{view.name}</Link>
          <Button size="icon-sm" variant="ghost" aria-label={`Remove saved view ${view.name}`} onClick={() => { if (store(views.filter((item) => item.name !== view.name))) setMessage(`Removed ${view.name}.`); }}><X size={14} /></Button>
        </li>)}
      </ul>
      {views.length === 0 ? <p className="pt-2 text-xs text-muted-foreground">No saved views for this report.</p> : null}
    </div>
  </details>;
}
