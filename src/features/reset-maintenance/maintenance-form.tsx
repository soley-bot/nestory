"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { restartPilotManualBillingAction, submitMaintenanceReviewAction } from "./actions";
import { MAX_REVIEW_BYTES, parseSessionReview, reviewUsesSoleAdministrator, RESET_STAGE_LABELS, type MaintenanceActionState, type ManualRestartActionState, type PilotManualRestartStatus, type SessionReview } from "./review";

export function MaintenanceForm({ manualRestart }: { manualRestart?: PilotManualRestartStatus | null } = {}) {
  const [source, setSource] = useState("");
  const [review, setReview] = useState<SessionReview | null>(null);
  const [fileError, setFileError] = useState("");
  const fileRead = useRef(0);
  const [state, action, pending] = useActionState(submitMaintenanceReviewAction, { kind: "idle" } as MaintenanceActionState);
  const locked = pending || ["issued", "endorsed", "uncertain"].includes(state.kind);
  return <div className="max-w-3xl space-y-5">
    {manualRestart !== undefined && <ManualRestartPanel status={manualRestart} />}
    <section className="space-y-5 rounded-xl border bg-card p-5">
    <div className="space-y-2">
      <h1 className="text-lg font-semibold">Pilot October reset approvals</h1>
      <p className="text-sm text-muted-foreground">Review one stage of the prepared reset or recovery packet. October starts with zero balances and no rental invoices. Properties, people, leases and all contract terms stay intact; billing stays paused.</p>
      <p className="text-sm text-muted-foreground">This page records your approval. The protected operator performs the stage after checking the backup, current source and execution gates.</p>
    </div>
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="reset-review-file" className="text-sm font-medium">Reviewed authorization file</label>
        <Input id="reset-review-file" type="file" accept="application/json,.json" disabled={locked} onChange={async event => {
          const file = event.target.files?.[0];
          const read = ++fileRead.current;
          setSource(""); setReview(null); setFileError("");
          if (!file || file.size > MAX_REVIEW_BYTES) { setFileError("Choose a reviewed JSON file no larger than 256 KiB."); return; }
          try {
            const content = await file.text(), parsed = parseSessionReview(content);
            if (read !== fileRead.current) return;
            if (!parsed) { setFileError("This is not a valid Pilot empty-books authorization file."); return; }
            setSource(content); setReview(parsed);
          } catch { if (read === fileRead.current) setFileError("The file could not be read."); }
        }} />
        <p className="text-xs text-muted-foreground">Only the reviewed binding, zero plan and digests belong in this file. Do not select a backup, secret, token or SQL file.</p>
        {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}
      </div>
      <input type="hidden" name="review" value={source} />
      {review && <div key={`${review.action}:${review.bindingSha256}`} className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">{RESET_STAGE_LABELS[review.action]}</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt>Operation</dt><dd className="break-all font-mono">{review.binding.recovery?.operation_id ?? review.binding.operation_id}</dd>
          <dt>Business date</dt><dd>{review.binding.recovery?.execution_business_date ?? review.binding.execution_business_date}</dd>
          <dt>Lease contracts</dt><dd>{review.binding.continuation_semantic.leases.length} preserved, including archived and terminal leases</dd>
          <dt>Main revision</dt><dd className="break-all font-mono">{review.binding.main_sha}</dd>
          <dt>Packet digest</dt><dd className="break-all font-mono">{review.binding.packet_sha256}</dd>
          <dt>Binding digest</dt><dd className="break-all font-mono">{review.bindingSha256}</dd>
          <dt>Zero-plan digest</dt><dd className="break-all font-mono">{review.binding.zero_review_sha256}</dd>
          {review.binding.recovery && <>
            <dt>Recovery plan</dt><dd className="break-all font-mono">{review.binding.recovery.plan_sha256}</dd>
            <dt>Recovery checkpoint</dt><dd className="break-all font-mono">{review.binding.recovery.report_checkpoint_sha256}</dd>
          </>}
        </dl>
        {review.binding.recovery && <p className="text-sm text-muted-foreground">Recovery may restore prior financial records. Review its separate operation, recovery plan and checkpoint before approving.</p>}
        {reviewUsesSoleAdministrator(review) ? <p className="text-sm font-medium">One-off Pilot October policy: you approve as the sole administrator. No independent reviewer is claimed. Only the named maker’s genuine signed-in session may endorse this plan; all backup, recovery and scope checks still apply.</p> : review.action === "approve-zero-plan" && <p className="text-sm text-muted-foreground">The database accepts this endorsement only from the maker or reviewer named in the prepared zero plan. Each person must use their own signed-in session.</p>}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirm" value="reviewed" required disabled={locked} className="mt-1" />
          <span>I reviewed the matching packet and the stage and digests shown above, and approve this stage.</span>
        </label>
      </div>}
      <Button type="submit" disabled={!review || locked}>{pending ? "Recording approval…" : review ? RESET_STAGE_LABELS[review.action] : "Choose a review file"}</Button>
      {state.message && <div role={state.kind === "invalid" || state.kind === "uncertain" ? "alert" : "status"} className="space-y-2 text-sm">
        <p>{state.message}</p>
        {state.authorizationId && <p>Authorization locator: <code className="break-all">{state.authorizationId}</code></p>}
      </div>}
    </form>
  </section></div>;
}

export function ManualRestartPanel({ status }: { status: PilotManualRestartStatus | null }) {
  const [state, action, pending] = useActionState(restartPilotManualBillingAction, { kind: "idle" } as ManualRestartActionState);
  const reopened = status?.status === "already_open" && status.billing_mode === "manual" || state.kind === "reopened";
  const locked = pending || reopened || state.kind === "uncertain";
  return <section className="space-y-4 rounded-xl border bg-card p-5">
    <h2 className="text-lg font-semibold">{reopened ? "Pilot is open for manual billing" : "Resume Pilot after the October reset"}</h2>
    <p className="text-sm text-muted-foreground">Reopen financial entry with automatic rent invoices off. Users choose when to generate rent or enter charges, payments, expenses and deposits. This does not run the reset again or generate invoices.</p>
    {status && <p className="text-sm">Retained records: {status.preserved_counts.properties} properties, {status.preserved_counts.units} units, {status.preserved_counts.people} people and {status.preserved_counts.leases} leases. The financial period starts on 1 October 2026.</p>}
    {reopened ? <Button asChild>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- A full navigation replaces the frozen financial session after restart. */}
      <a href="/properties">Open Pilot</a>
    </Button> : status?.eligible && status.checkpoint_sha256 ?
      <form action={action} className="space-y-4">
        <input type="hidden" name="expectedGeneration" value={status.generation} />
        <input type="hidden" name="checkpointSha256" value={status.checkpoint_sha256} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirm" value="manual-billing" required disabled={locked} className="mt-1" />
          <span>I approve reopening Pilot for manual financial entry. Automatic rent invoices remain off.</span>
        </label>
        <Button type="submit" disabled={locked}>{pending ? "Reopening Pilot…" : "Reopen Pilot for manual billing"}</Button>
      </form> : <p role="status" className="text-sm">The completed reset is not ready to reopen, or this session could not verify it. Refresh after checking your administrator session.</p>}
    {state.message && <p role={state.kind === "invalid" || state.kind === "uncertain" ? "alert" : "status"} className="text-sm">{state.message}</p>}
  </section>;
}
