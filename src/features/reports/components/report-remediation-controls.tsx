"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setLedgerPeriodLockAction } from "@/features/ledger/actions";

export function RecheckReport() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <Button size="sm" variant="outline" disabled={pending}
    onClick={() => startTransition(() => router.refresh())}>
    {pending ? "Rechecking…" : "Recheck"}
  </Button>;
}

/** Keep the form mounted when collapsed so cancellation does not discard a draft. */
export function ReportRemediation({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="space-y-3">
    <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>{label}</Button>
    <div hidden={!open} className="space-y-3 border-l-2 border-border pl-3">
      {children}
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Back to report</Button>
    </div>
  </div>;
}

/** Submit the existing server command without React resetting a failed form. */
export function ReportActionForm({ action, children, className, newCommandLabel, successMessage = "Saved. Recheck the report for the latest status." }: {
  action: (data: FormData) => Promise<void | { status?: string; message?: string; fieldErrors?: Record<string, string[]> }>;
  children: ReactNode;
  className?: string;
  successMessage?: string;
  newCommandLabel?: string;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const replayKeys = useRef(new Map<string, string>());
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [completed, setCompleted] = useState(false);
  return <form className={className} onSubmit={(event) => {
    event.preventDefault();
    if (inFlight.current || completed) return;
    const data = new FormData(event.currentTarget);
    const key = data.get("idempotencyKey");
    if (typeof key === "string") {
      const payload = JSON.stringify([...data.entries()].filter(([name]) => name !== "idempotencyKey"));
      const retainedKey = replayKeys.current.get(payload);
      if (retainedKey) data.set("idempotencyKey", retainedKey);
      else {
        const freshKey = `report-command-${crypto.randomUUID()}`;
        replayKeys.current.set(payload, freshKey);
        data.set("idempotencyKey", freshKey);
      }
    }
    inFlight.current = true;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action(data);
        if (result?.status === "error") {
          setFailed(true);
          setMessage(result.message ?? (Object.values(result.fieldErrors ?? {}).flat().join(" ") || "Check the form and try again."));
          return;
        }
        setFailed(false);
        setCompleted(true);
        setMessage(successMessage);
        router.refresh();
      } catch {
        setFailed(true);
        setMessage("The update could not be confirmed. Your entries are kept. Recheck the report before retrying; the state or your permissions may have changed.");
      } finally {
        inFlight.current = false;
      }
    });
  }}>
    <fieldset disabled={pending || completed} className="contents">{children}</fieldset>
    {pending ? <p role="status" className="text-sm md:col-span-full">Saving…</p> : null}
    {message ? <div role={failed ? "alert" : "status"} className="space-y-2 text-sm md:col-span-full">
      <p>{message}</p>{failed ? <RecheckReport /> : null}
    </div> : null}
    {completed && newCommandLabel ? <Button type="button" variant="outline" size="sm" onClick={() => {
      replayKeys.current.clear();
      setCompleted(false);
      setMessage(null);
    }}>{newCommandLabel}</Button> : null}
  </form>;
}

export function LockReportMonth({ month }: { month: string }) {
  return <ReportRemediation label="Lock financial month">
    <ReportActionForm action={async (data) => setLedgerPeriodLockAction({}, data)}
      className="space-y-3" successMessage="Financial month locked. Rechecking report readiness.">
      <input type="hidden" name="periodStart" value={month} />
      <input type="hidden" name="lockState" value="locked" />
      <p className="text-sm">Locking {month} prevents financial changes for the entire company. Finish recording and reviewing this month first.</p>
      <label className="grid gap-1 text-sm font-medium">Lock reason<Input name="reason" required maxLength={400} /></label>
      <Button type="submit">Lock {month}</Button>
    </ReportActionForm>
  </ReportRemediation>;
}
