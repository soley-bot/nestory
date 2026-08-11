"use client";

import { useActionState, type ReactNode } from "react";
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
  ownerOpeningTotal: string;
  reconciliationDifferences: string[];
  reconciliationSha256: string | null;
  selectedRentMonths: string[];
  signedExceptions: string[];
  status: "staged" | "blocked" | "reconciled" | "abandoned";
  tenantOpeningTotal: string;
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
  if (!canManage && !detail) {
    return <p>Cutover authority is read-only for this role.</p>;
  }

  return (
    <section aria-labelledby="ips-cutover-heading" className="space-y-4">
      <header>
        <h2 id="ips-cutover-heading" className="text-lg font-semibold">
          IPS cutover reconciliation
        </h2>
        <p className="text-sm text-muted-foreground">
          Freeze imported authority, selected rent months, and opening totals before hosted activation.
        </p>
      </header>
      {detail ? (
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <Field label="Authority start">{detail.authorityStartDate}</Field>
          <Field label="Data owner">{detail.dataOwner}</Field>
          <Field label="Manifest SHA-256">{detail.manifestSha256}</Field>
          <Field label="Selected rent months">{detail.selectedRentMonths.join(", ")}</Field>
          <Field label="Tenant opening total">{detail.tenantOpeningTotal} USD</Field>
          <Field label="Owner opening total">{detail.ownerOpeningTotal} USD</Field>
          <Field label="Status">{detail.status}</Field>
          {detail.reconciliationSha256 ? (
            <Field label="Reconciliation SHA-256">{detail.reconciliationSha256}</Field>
          ) : null}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">No cutover manifest has been staged.</p>
      )}
      {detail?.blockers.length ? (
        <div role="alert" className="rounded-md border border-destructive/40 p-3">
          <p className="font-medium">Cutover blockers</p>
          <ul className="list-disc pl-5">
            {detail.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        </div>
      ) : null}
      {detail?.reconciliationDifferences.length ? (
        <div role="alert" className="rounded-md border border-destructive/40 p-3">
          <p className="font-medium">Reconciliation differences</p>
          <ul className="list-disc pl-5">
            {detail.reconciliationDifferences.map((difference) => (
              <li key={difference}>{difference}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {detail?.importCounts.length ? (
        <div className="space-y-1 text-sm">
          <p className="font-medium">Imported entity counts</p>
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
        <p className="font-medium">Signed exceptions</p>
        {detail?.signedExceptions.length ? (
          <ul className="list-disc pl-5 text-muted-foreground">
            {detail.signedExceptions.map((exception) => <li key={exception}>{exception}</li>)}
          </ul>
        ) : (
          <p className="text-muted-foreground">None recorded.</p>
        )}
      </div>
      {canManage ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <form action={stageAction} className="space-y-3 rounded-md border border-border p-3">
            <h3 className="font-medium">Stage redacted manifest</h3>
            <FormField label="Authority start date" name="authorityStartDate" type="date" defaultValue={detail?.authorityStartDate ?? "2026-09-01"} />
            <FormField label="Redacted data owner" name="dataOwner" defaultValue={detail?.dataOwner ?? "REDACTED-IPS-DATA-OWNER"} />
            <FormField
              label="Stage request key"
              name="idempotencyKey"
              defaultValue=""
              placeholder="Use a new key for each corrected manifest"
            />
            <label className="block space-y-1 text-sm font-medium">
              <span>Manifest JSON</span>
              <textarea
                aria-label="Manifest JSON"
                name="manifest"
                required
                rows={8}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              />
            </label>
            <button type="submit" disabled={staging} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
              {staging ? "Staging…" : "Stage cutover manifest"}
            </button>
            <ActionMessage state={stageState} />
          </form>
          <form action={commitAction} className="space-y-3 rounded-md border border-border p-3">
            <h3 className="font-medium">Freeze reconciliation</h3>
            <input type="hidden" name="batchId" value={detail?.batchId ?? ""} />
            <FormField
              label="Commit request key"
              name="idempotencyKey"
              defaultValue={detail ? `ips-cutover-commit-${detail.batchId}` : ""}
            />
            <label className="block space-y-1 text-sm font-medium">
              <span>Reconciliation sign-off reason</span>
              <textarea
                aria-label="Reconciliation sign-off reason"
                name="signoffReason"
                required
                rows={3}
                defaultValue="Redacted source totals independently checked"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={committing || !detail || !["staged", "reconciled"].includes(detail.status) || detail.blockers.length > 0}
              className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {committing
                ? "Reconciling…"
                : detail?.status === "reconciled"
                  ? "Replay reconciled cutover"
                  : "Commit reconciled cutover"}
            </button>
            <p className="text-xs text-muted-foreground">
              Hosted activation remains a separate approved production-readiness step.
            </p>
            <ActionMessage state={commitState} />
          </form>
        </div>
      ) : (
        <p>Cutover authority is read-only for this role.</p>
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
      <input
        aria-label={label}
        defaultValue={defaultValue}
        name={name}
        placeholder={placeholder}
        required
        type={type}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
