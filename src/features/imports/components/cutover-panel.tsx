"use client";

import { useActionState, useState, type ReactNode } from "react";
import { AuditDetails } from "@/components/ui/audit-details";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CutoverActionState } from "@/features/imports/action-states";
import {
  commitIpsCutoverBatchAction,
  stageIpsCutoverBatchAction,
} from "@/features/imports/cutover-actions";

const initialActionState: CutoverActionState = {};

export type CutoverPanelDetail = {
  authorityStartDate: string;
  batchId: string;
  blockers: string[];
  dataOwner: string;
  importCounts: Array<{ actual: string | null; expected: string; label: string }>;
  manifestSha256: string;
  ownerOpeningTotals: Array<{ amount: string; currency: string }>;
  reconciliationDifferences: string[];
  reconciliationSha256: string | null;
  selectedRentMonths: string[];
  signedExceptions: Array<{
    approvedAt: string;
    approvedBy: string;
    reason: string;
    sourceKey: string;
  }>;
  status: "staged" | "blocked" | "reconciled" | "abandoned";
  tenantOpeningTotals: Array<{ amount: string; currency: string }>;
};

export function CutoverPanel({
  canManage,
  detail,
}: {
  canManage: boolean;
  detail: CutoverPanelDetail | null;
}) {
  const [stageState, stageAction, staging] = useActionState(
    stageIpsCutoverBatchAction,
    initialActionState,
  );
  const [commitState, commitAction, committing] = useActionState(
    commitIpsCutoverBatchAction,
    initialActionState,
  );
  const [stageRequestKey] = useState(() => `ips-cutover-stage-${crypto.randomUUID()}`);
  if (!canManage && !detail) {
    return <p>Import cutover is read-only for this role.</p>;
  }

  return (
    <section aria-labelledby="ips-cutover-heading" className="space-y-4">
      <header>
        <h2 id="ips-cutover-heading" className="text-lg font-semibold">
          Import cutover
        </h2>
        <p className="text-sm text-muted-foreground">
          Check imported records and opening totals before enabling the hosted workspace.
        </p>
      </header>
      {detail ? (
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <Field label="Start date">{detail.authorityStartDate}</Field>
          <Field label="Data owner">{detail.dataOwner}</Field>
          <Field label="Selected rent months">{detail.selectedRentMonths.join(", ")}</Field>
          {detail.tenantOpeningTotals.map((total) => (
            <Field key={`tenant-${total.currency}`} label={`Tenant opening total (${total.currency})`}>
              {total.amount} {total.currency}
            </Field>
          ))}
          {detail.ownerOpeningTotals.map((total) => (
            <Field key={`owner-${total.currency}`} label={`Owner opening total (${total.currency})`}>
              {total.amount} {total.currency}
            </Field>
          ))}
          <Field label="Status">{statusLabel(detail.status)}</Field>
          <AuditDetails
            entries={[
              { label: "Manifest fingerprint", value: detail.manifestSha256 },
              { label: "Reconciliation fingerprint", value: detail.reconciliationSha256 },
            ]}
          />
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">No import plan has been staged.</p>
      )}
      {detail?.blockers.length ? (
        <div role="alert" className="rounded-md border border-destructive/40 p-3">
          <p className="font-medium">Import blockers</p>
          <ul className="list-disc pl-5">
            {detail.blockers.map((blocker) => <li key={blocker}>{plainIssue(blocker)}</li>)}
          </ul>
        </div>
      ) : null}
      {detail?.reconciliationDifferences.length ? (
        <div role="alert" className="rounded-md border border-destructive/40 p-3">
          <p className="font-medium">Records that do not match</p>
          <ul className="list-disc pl-5">
            {detail.reconciliationDifferences.map((difference) => (
              <li key={difference}>{plainIssue(difference)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {detail?.importCounts.length ? (
        <div className="space-y-1 text-sm">
          <p className="font-medium">Imported records</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {detail.importCounts.map((count) => (
              <li key={count.label}>
                {count.label}: {count.expected} expected / {count.actual ?? "pending"} actual
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="space-y-1 text-sm">
        <p className="font-medium">Approved exceptions</p>
        {detail?.signedExceptions.length ? (
          <ul className="list-disc pl-5 text-muted-foreground">
            {detail.signedExceptions.map((exception) => (
              <li key={exception.sourceKey}>
                {exception.reason} ({exception.approvedBy}, {exception.approvedAt})
                <AuditDetails entries={[{ label: "Source key", value: exception.sourceKey }]} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">None recorded.</p>
        )}
      </div>
      {canManage ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <form action={stageAction} className="space-y-3 rounded-md border border-border p-3">
            <h3 className="font-medium">Stage import plan</h3>
            <FormField label="Start date" name="authorityStartDate" type="date" defaultValue={detail?.authorityStartDate ?? "2026-09-01"} />
            <FormField label="Data owner" name="dataOwner" defaultValue={detail?.dataOwner ?? ""} placeholder="Name or team" />
            <input name="idempotencyKey" type="hidden" value={stageRequestKey} />
            <details>
              <summary className="w-fit cursor-pointer text-sm font-medium">Technical manifest</summary>
              <label className="mt-3 block space-y-1 text-sm font-medium">
                <span>Manifest data (JSON)</span>
                <Textarea
                  aria-label="Manifest data (JSON)"
                  className="font-mono text-xs"
                  name="manifest"
                  required
                  rows={8}
                />
              </label>
            </details>
            <Button disabled={staging} type="submit">
              {staging ? "Staging…" : "Stage import plan"}
            </Button>
            <ActionMessage state={stageState} />
          </form>
          <form action={commitAction} className="space-y-3 rounded-md border border-border p-3">
            <h3 className="font-medium">Confirm imported totals</h3>
            <input type="hidden" name="batchId" value={detail?.batchId ?? ""} />
            <input name="idempotencyKey" type="hidden" value={detail ? `ips-cutover-commit-${detail.batchId}` : ""} />
            <label className="block space-y-1 text-sm font-medium">
              <span>Approval reason</span>
              <Textarea
                aria-label="Approval reason"
                name="signoffReason"
                required
                rows={3}
                defaultValue="Redacted source totals independently checked"
              />
            </label>
            <Button
              disabled={committing || !detail || !["staged", "reconciled"].includes(detail.status) || detail.blockers.length > 0}
              type="submit"
            >
              {committing
                ? "Checking…"
                : detail?.status === "reconciled"
                  ? "Recheck imported totals"
                  : "Confirm imported totals"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Activating production remains a separate approved step.
            </p>
            <ActionMessage state={commitState} />
          </form>
        </div>
      ) : (
        <p>Import cutover is read-only for this role.</p>
      )}
    </section>
  );
}

function FormField({
  defaultValue,
  label,
  name,
  placeholder,
  type = "text",
}: {
  defaultValue: string;
  label: string;
  name: string;
  placeholder?: string;
  type?: "date" | "text";
}) {
  return (
    <label className="block space-y-1 text-sm font-medium">
      <span>{label}</span>
      <Input
        aria-label={label}
        defaultValue={defaultValue}
        name={name}
        placeholder={placeholder}
        required
        type={type}
      />
    </label>
  );
}

function ActionMessage({ state }: { state: CutoverActionState }) {
  return state.message ? (
    <p role="status" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
      {state.message}
    </p>
  ) : null;
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="break-all text-muted-foreground">{children}</dd>
    </div>
  );
}

function statusLabel(value: CutoverPanelDetail["status"]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function plainIssue(value: string) {
  const sentence = value.replaceAll("_", " ").trim();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
