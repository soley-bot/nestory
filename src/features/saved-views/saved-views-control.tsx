"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { Bookmark, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseSavedViews, sanitizeViewQuery, type SavedView } from "./saved-views";

type Props = { resource: string; scope: string; query: string; legacyStorageKey?: string };
export function SavedViewsControl(props: Props) {
  return <SavedViewsContent key={`${props.scope}:${props.resource}`} {...props} />;
}

function SavedViewsContent({ resource, scope, query, legacyStorageKey }: Props) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const [legacy, setLegacy] = useState(() => {
    try { return legacyStorageKey ? parseSavedViews(resource, JSON.parse(localStorage.getItem(legacyStorageKey) ?? "[]")) : []; } catch { return []; }
  });
  const inputId = useId();
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    void fetch(`/api/workspace/saved-views?resource=${encodeURIComponent(resource)}`, { cache: "no-store", signal: abort.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Saved views are unavailable. Try again.");
        if (body.scope !== scope) throw new Error("Your workspace changed. Reload before using saved views.");
        if (!abort.signal.aborted) { setViews(parseSavedViews(resource, body.views)); setReady(true); }
      }).catch(error => { if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : "Saved views are unavailable."); });
    return () => abort.abort();
  }, [open, resource, scope, retry]);

  async function change(view: SavedView, remove = false, importLocal = false) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const savedView = { ...view, query: remove ? "" : sanitizeViewQuery(resource, view.query) };
      const response = await fetch("/api/workspace/saved-views", {
        method: remove ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource, scope, name: savedView.name, ...(!remove ? { query: savedView.query } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save this change. Try again.");
      if (body.scope !== scope) throw new Error("Your workspace changed. Reload before using saved views.");
      setViews(previous => [...previous.filter(item => item.name !== savedView.name), ...(!remove ? [savedView] : [])].toSorted((a, b) => a.name.localeCompare(b.name)));
      if (importLocal && legacyStorageKey) {
        const remaining = legacy.filter(item => item.name !== view.name);
        setLegacy(remaining);
        try { localStorage.setItem(legacyStorageKey, JSON.stringify(remaining)); } catch { /* The cloud copy is already confirmed. */ }
      }
      setMessage(`${remove ? "Removed" : "Saved"} ${view.name}.`);
      if (!remove) setName("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save this change. Try again."); }
    finally { setBusy(false); }
  }

  return <Popover.Root open={open} onOpenChange={value => { setOpen(value); if (value) { setReady(false); setMessage(""); } }}>
    <Popover.Trigger asChild><Button variant="ghost" size="sm"><Bookmark aria-hidden="true" size={14} />Saved views</Button></Popover.Trigger>
    <Popover.Portal><Popover.Content align="end" sideOffset={6} className="z-[80] max-h-[75vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border bg-popover p-3 shadow-lg">
      <p className="mb-3 text-xs text-muted-foreground">Personal to you in this workspace · available on your devices</p>
      <form onSubmit={event => { event.preventDefault(); if (name.trim()) void change({ name: name.trim(), query }); }} className="space-y-2">
        <label className="block text-xs font-medium" htmlFor={inputId}>View name</label>
        <Input id={inputId} maxLength={60} value={name} onChange={event => setName(event.target.value)} required placeholder="For example, available units" />
        <Button size="sm" type="submit" variant="outline" disabled={!ready || busy}>Save current view</Button>
      </form>
      {message ? <p role="status" className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
      {!ready ? <div className="mt-2 text-xs text-muted-foreground">{message ? <button className="underline" type="button" onClick={() => { setMessage(""); setRetry(value => value + 1); }}>Retry loading views</button> : <span role="status">Loading saved views…</span>}</div> : null}
      <ul aria-label="Saved views" className="mt-3 divide-y divide-border border-t border-border">
        {ready && views.map(view => <li className="flex items-center gap-2 py-1" key={view.name}>
          <Link className="min-w-0 flex-1 truncate py-1 text-sm font-medium hover:underline" href={`${resource}?${view.query}`} onNavigate={() => setOpen(false)}>{view.name}</Link>
          <Button type="button" size="icon-sm" variant="ghost" disabled={busy} aria-label={`Remove saved view ${view.name}`} onClick={() => void change(view, true)}><X aria-hidden="true" size={14} /></Button>
        </li>)}
      </ul>
      {ready && !views.length ? <p className="pt-2 text-xs text-muted-foreground">No saved views yet.</p> : null}
      {legacy.length ? <section className="mt-3 border-t border-border pt-3"><h3 className="text-xs font-semibold">From this browser</h3><p className="mt-1 text-xs text-muted-foreground">Sync a view to make it available on your other devices. An existing view with the same name will be replaced.</p>
        {legacy.map(view => <div className="mt-2 flex items-center gap-2" key={view.name}><Link href={`${resource}?${view.query}`} className="min-w-0 flex-1 truncate text-sm hover:underline">{view.name}</Link><Button type="button" size="sm" variant="outline" disabled={!ready || busy} onClick={() => void change(view, false, true)}>Sync {view.name}</Button></div>)}
      </section> : null}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
