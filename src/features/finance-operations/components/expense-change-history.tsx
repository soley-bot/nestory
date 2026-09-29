"use client";

import { useEffect, useState } from "react";
import { getExpenseHistory } from "../expense-history";

type Entry = Awaited<ReturnType<typeof getExpenseHistory>>[number];
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const fields = { expense_date: "Paid date", payee_label: "Paid to", reference: "Reference", pay_from_account_id: "Paid-from account", status: "Status" };
function readable(value: unknown): string { return value == null || value === "" ? "—" : String(value); }

export function ExpenseChangeHistory({ transactionId }: { transactionId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    getExpenseHistory(transactionId).then(result => { if (active) setEntries(result); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [transactionId]);
  return <section aria-label="Change history" className="border-t border-border pt-4">
    <h3 className="text-sm font-semibold">Change history</h3>
    {failed ? <p role="alert" className="text-sm">Could not load change history. Reopen this expense to try again.</p> : !entries ? <p role="status" className="text-sm text-muted-foreground">Loading history…</p> : entries.length === 0 ? <p className="text-sm text-muted-foreground">No saved changes.</p> : <ol className="divide-y divide-border">{entries.map(item => {
      const before = object(object(item.previous_values).expense);
      const afterPayload = object(item.new_values);
      const after = object(afterPayload.expense);
      const changes = Object.entries(fields).filter(([key]) => key in before && readable(before[key]) !== readable(after[key]));
      const beforeLines = object(item.previous_values).lines;
      const afterLines = afterPayload.lines;
      return <li key={item.id} className="py-3 text-sm">
        <p><span className="font-medium capitalize">{item.action}</span> · {item.actor}</p>
        <time className="text-xs text-muted-foreground" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
        {typeof afterPayload.reason === "string" ? <p className="mt-1">{afterPayload.reason}</p> : null}
        {changes.length ? <dl className="mt-2 space-y-1">{changes.map(([key,label]) => <div key={key}><dt className="inline font-medium">{label}: </dt><dd className="inline">{readable(before[key])} → {readable(after[key])}</dd></div>)}</dl> : null}
        {Array.isArray(beforeLines) && Array.isArray(afterLines) ? <details className="mt-2"><summary className="cursor-pointer">Before and after line items</summary>{[["Before",beforeLines],["After",afterLines]].map(([label,lines]) => <div key={String(label)} className="mt-2"><p className="font-medium">{String(label)}</p><ul>{(lines as unknown[]).map((line,index) => { const value=object(line); return <li key={index}>{readable(value.description)} · {readable(value.amount)} paid · {readable(value.customer_total)} charged</li>; })}</ul></div>)}</details> : null}
      </li>;
    })}</ol>}
    {entries?.length === 100 ? <p className="text-xs text-muted-foreground">Showing the latest 100 changes.</p> : null}
  </section>;
}
