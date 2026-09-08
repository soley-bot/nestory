import { randomUUID } from "node:crypto";
import Link from "next/link";
import { calculateReportMonthAction } from "@/features/reports/remediation-actions";
import { LockReportMonth, RecheckReport, ReportActionForm, ReportRemediation } from "@/features/reports/components/report-remediation-controls";
import type { ReactNode } from "react";
import { AuditDetails } from "@/components/ui/audit-details";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import { formatDate } from "@/lib/dates/format";
import {
  closeReportMonthAction,
  publishReportStatementAction,
  correctReportMonthAction,
  reopenReportMonthAction,
  resumeReportStatementAction,
} from "@/features/reports/remediation-actions";
import {
  OWNER_BALANCE_COMPONENT_LABELS,
  OWNER_BALANCE_COMPONENTS,
} from "@/features/owner-balances/owner-balance.types";
import type {
  OwnerCloseBlocker,
  OwnerCloseData,
  OwnerCloseLine,
  OwnerCloseSeriesState,
} from "@/features/owner-close/owner-close.types";

type OwnerCloseScreenProps = {
  canClose: boolean;
  canPublish?: boolean;
  canReopen: boolean;
  data: OwnerCloseData;
  monthStart: string;
  ownerPersonId?: string;
  propertyId?: string;
  presentation?: "close" | "statements";
  canLockMonth?: boolean;
  openingAuthority?: ReactNode;
  sourceAuthority?: ReactNode;
};

export function OwnerCloseScreen({
  canClose,
  canPublish = false,
  canReopen,
  data,
  monthStart,
  ownerPersonId,
  propertyId,
  presentation = "close",
  canLockMonth = false,
  openingAuthority,
  sourceAuthority,
}: OwnerCloseScreenProps) {
  const hasExactScope = Boolean(propertyId && ownerPersonId);
  const preparingRevision = data.revisions.find(
    (revision) => revision.status === "preparing",
  );
  const closeRevisionNumber = preparingRevision?.revisionNumber ?? 1;
  const scopeIsCloseReady = data.readiness?.isReady === true &&
    isCloseableSeriesState(data.series?.state);
  const mayClose = hasExactScope && canClose && scopeIsCloseReady;
  const mayReopen = canReopen && data.series !== null &&
    (data.series.state === "closed" || data.series.state === "stale") &&
    !data.publicationReadiness?.blockers.some(blocker => blocker.code === "owner_statement_artifacts_incomplete");

  return (
    <section aria-labelledby="owner-close-heading" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold" id="owner-close-heading">
          {presentation === "statements" ? "Official owner statements" : "Close owner month"}
        </h2>
        <RecheckReport />
        {presentation === "close" ? (
          <p className="text-sm text-muted-foreground">
            Close the selected owner month only after every balance and source check passes.
          </p>
        ) : null}
      </header>

      {!hasExactScope || !data.readiness ? (
        <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          Select an exact property and owner assignment to inspect close readiness.
        </div>
      ) : (
        <>
          {presentation === "statements" ? (
            <PublicationAuthority canPublish={canPublish} data={data} compact />
          ) : null}

          <StatementDisclosure
            enabled={presentation === "statements"}
            label="Prepare or correct a statement"
            open={presentation === "statements" && (data.publications ?? []).length === 0 && data.publicationReadiness?.isReady !== true}
          >
            <ReadinessCard data={data} closeRevisionNumber={closeRevisionNumber}
              canClose={canClose} canLockMonth={canLockMonth}
              openingAuthority={openingAuthority} sourceAuthority={sourceAuthority}
              monthStart={monthStart} propertyId={propertyId!} ownerPersonId={ownerPersonId!} />

            {mayClose ? (
              <ReportActionForm
                action={closeReportMonthAction}
                successMessage="Owner month closed. Rechecking statement readiness."
                className="grid gap-3 rounded-lg border border-success/30 bg-success-soft/50 p-4 md:grid-cols-[1fr_auto]"
              >
                <input name="currency" type="hidden" value="USD" />
                <input name="monthStart" type="hidden" value={monthStart} />
                <input name="ownerPersonId" type="hidden" value={ownerPersonId} />
                <input name="propertyId" type="hidden" value={propertyId} />
                <input
                  name="idempotencyKey"
                  type="hidden"
                  value={`owner-close-r${closeRevisionNumber}-${randomUUID()}`}
                />
                <label className="grid gap-1 text-sm font-medium">
                  Close reason
                  <Input
                    className="h-10"
                    minLength={3}
                    name="closeReason"
                    required
                  />
                </label>
                <Button
                  className="h-10 self-end px-4"
                  type="submit"
                >
                  Close owner month
                </Button>
              </ReportActionForm>
            ) : null}

            {mayReopen ? (
              <ReportRemediation label="Prepare a corrected statement">
              <ReportActionForm
                action={reopenReportMonthAction}
                successMessage="Month reopened for correction. Rechecking readiness."
                className="grid gap-3 rounded-lg border border-warning/30 bg-warning-soft/50 p-4 md:grid-cols-[1fr_auto]"
              >
                <input name="seriesId" type="hidden" value={data.series!.id} />
                <input
                  name="idempotencyKey"
                  type="hidden"
                  value={`owner-reopen-${randomUUID()}`}
                />
                <label className="grid gap-1 text-sm font-medium">
                  Reopen reason
                  <Input
                    className="h-10"
                    minLength={3}
                    name="reopenReason"
                    required
                  />
                </label>
                <Button
                  className="h-10 self-end px-4"
                  type="submit"
                  variant="outline"
                >
                  Reopen month
                </Button>
              </ReportActionForm>
              </ReportRemediation>
            ) : null}

            {canReopen && preparingRevision ? (
              <CorrectionForm monthStart={monthStart} revisionId={preparingRevision.id} />
            ) : null}
          </StatementDisclosure>

          {presentation !== "statements" ? (
            <PublicationAuthority canPublish={canPublish} data={data} />
          ) : null}

          <StatementDisclosure enabled={presentation === "statements"} label="Revision history and source details">
            <RevisionHistory data={data} />
          </StatementDisclosure>
        </>
      )}
    </section>
  );
}

function StatementDisclosure({ children, enabled, label, open = false }: {
  children: ReactNode;
  enabled: boolean;
  label: string;
  open?: boolean;
}) {
  if (!enabled) return children;
  return (
    <details className="border-y border-border" open={open}>
      <summary className="cursor-pointer py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label}
      </summary>
      <div className="space-y-4 border-t border-border py-4">{children}</div>
    </details>
  );
}

function PublicationAuthority({
  canPublish,
  data,
  compact = false,
}: {
  canPublish: boolean;
  data: OwnerCloseData;
  compact?: boolean;
}) {
  const readiness = data.publicationReadiness;
  const publications = data.publications ?? [];
  return (
    <section aria-label={compact ? "Saved statements" : undefined} aria-labelledby={compact ? undefined : "owner-statement-publication-heading"} className="space-y-3">
      {!compact ? (
      <div>
        <h3 className="font-semibold" id="owner-statement-publication-heading">
          Official owner statements
        </h3>
        <p className="text-sm text-muted-foreground">
          Numbered PDF and Excel statements saved from a closed owner month.
        </p>
      </div>
      ) : null}

      {publications.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No official Owner Statement has been published for this owner month.
        </p>
      ) : (
        <div className="space-y-2">
          {publications.map((publication) => {
            const filesComplete = publication.artifacts.some((artifact) => artifact.format === "pdf") &&
              publication.artifacts.some((artifact) => artifact.format === "xlsx");
            const needsReview = data.series?.state !== "closed" ||
              data.series?.currentClosedRevisionId !== publication.revisionId;
            const superseded = Boolean(publication.supersededByPublicationId);
            const status = superseded ? "Superseded" : !filesComplete ? "Files incomplete" : needsReview ? "Needs review" : "Current";
            return (
            <article
              className="rounded-2xl border border-border/80 bg-card p-4"
              key={publication.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold">{publication.statementNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    Revision {publication.revisionNumber} · <time dateTime={publication.generatedAt}>{formatDate(publication.generatedAt)}</time>
                  </p>
                  <AuditDetails
                    className="mt-1"
                    entries={[
                      { label: "Generated at", value: publication.generatedAt },
                      { label: "Content hash", value: publication.contentHash },
                    ]}
                  />
                </div>
                <Badge tone={superseded ? "neutral" : needsReview || !filesComplete ? "warning" : "success"}>
                  {status}
                </Badge>
              </div>
              {!superseded && needsReview ? (
                <p className="mt-2 text-sm text-warning">This month has changed or is being corrected. Review it before sharing.</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {publication.artifacts.map((artifact) => (
                  <a
                    className="rounded-lg border border-border px-3 py-2 text-sm font-semibold"
                    href={`/api/reports/${artifact.format === "pdf" ? "pdf" : "excel"}?artifactId=${artifact.id}`}
                    key={artifact.id}
                  >
                    Download {artifact.format === "pdf" ? "PDF" : "Excel"}
                  </a>
                ))}
              </div>
            </article>
            );
          })}
        </div>
      )}

      {canPublish && readiness?.isReady ? (
        <ReportActionForm
          action={publishReportStatementAction}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/30 bg-success-soft/50 p-4"
        >
          <input name="revisionId" type="hidden" value={readiness.revisionId} />
          <input
            name="idempotencyKey"
            type="hidden"
            value={`owner-statement-${readiness.revisionId}-${randomUUID()}`}
          />
          <div>
            <p className="font-semibold">Ready to publish the owner statement</p>
            <p className="text-sm text-muted-foreground">
              Publishing assigns a permanent statement number and saves both file formats.
            </p>
          </div>
          <Button
            className="h-10 px-4"
            type="submit"
          >
            Publish owner statement
          </Button>
        </ReportActionForm>
      ) : canPublish &&
        readiness?.existingPublicationId &&
        readiness.blockers.some((blocker) =>
          blocker.code === "owner_statement_artifacts_incomplete"
        ) ? (
        <ReportActionForm
          action={resumeReportStatementAction}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning-soft/50 p-4"
        >
          <input name="publicationId" type="hidden" value={readiness.existingPublicationId} />
          <input
            name="idempotencyKey"
            type="hidden"
            value={`owner-statement-resume-${readiness.existingPublicationId}-${randomUUID()}`}
          />
          <div>
            <p className="font-semibold">Publication incomplete</p>
            <p className="text-sm text-muted-foreground">
              Resume checks the saved files and creates only the missing format.
            </p>
          </div>
          <Button
            className="h-10 px-4"
            type="submit"
          >
            Resume owner statement
          </Button>
        </ReportActionForm>
      ) : readiness && readiness.blockers.some(blocker => blocker.code !== "owner_statement_already_published") ? (
        <div className="rounded-2xl border border-border/80 bg-card p-4 text-sm">
          <p className="font-semibold">Publication blocked</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {[...new Set(readiness.blockers.filter(blocker => blocker.code !== "owner_statement_already_published").map(blockerLabel))].map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
          {!canPublish ? <p className="mt-2">A staff member with statement-publication permission must complete publication.</p> : null}
        </div>
      ) : readiness?.isReady && !canPublish ? <p className="text-sm">Ready for a staff member with statement-publication permission to publish.</p> : null}
    </section>
  );
}

function ReadinessCard({
  closeRevisionNumber,
  data,
  canClose, canLockMonth, openingAuthority, sourceAuthority, monthStart, propertyId, ownerPersonId,
}: {
  closeRevisionNumber: number;
  data: OwnerCloseData;
  canClose: boolean;
  canLockMonth: boolean;
  openingAuthority?: ReactNode;
  sourceAuthority?: ReactNode;
  monthStart: string;
  propertyId: string;
  ownerPersonId: string;
}) {
  const readiness = data.readiness!;
  const scopeIsCloseReady = readiness.isReady &&
    isCloseableSeriesState(data.series?.state);
  const blockers = readiness.blockers
    .filter(blocker => !(data.series?.state === "closed" && ["owner_close_reopen_required", "owner_balance_period_already_closed"].includes(blocker.code)))
    .toSorted((a, b) => prerequisiteRank(a.code) - prerequisiteRank(b.code));
  const nextRank = blockers.length ? prerequisiteRank(blockers[0].code) : 0;
  return (
    <article
      className="overflow-hidden rounded-2xl border border-border/80 bg-card"
      data-testid="owner-close-readiness"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div>
          <h3 className="font-semibold">
            {scopeIsCloseReady
      ? `Ready to close owner month · revision ${closeRevisionNumber}`
              : data.series?.state === "closed" ? "Owner month closed"
              : data.series?.state === "stale" ? "Closed month has changed"
              : "Prepare this month"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Series state: {data.series?.state ?? readiness.seriesState ?? "not started"}
          </p>
        </div>
        <p className="text-xs font-medium uppercase tracking-wide">
          {blockers.length > 0 ? `${blockers.length} checks to resolve` : ""}
        </p>
      </div>

      {blockers.length > 0 ? (
        <ul className="space-y-2 border-b border-border/60 bg-amber-50/60 px-4 py-3 text-sm">
          {blockers.map((blocker, index) => (
            <li key={`${blocker.code}:${index}`}>
              <p className="font-semibold text-amber-950">{blockerLabel(blocker)}</p>
              <div className="mt-2">
                {prerequisiteRank(blocker.code) > nextRank ? (
                  <p className="text-xs text-muted-foreground">{blocker.code === "financial_month_not_locked" ? "Lock the company month after the earlier checks are resolved." : "Calculate after the earlier checks are resolved."}</p>
                ) : blocker.code === "financial_month_not_locked" ? (
                  canLockMonth ? <LockReportMonth month={monthStart.slice(0, 7)} /> : <p>A staff member with Finance close-period permission must lock this month.</p>
                ) : ["owner_balance_period_missing", "owner_balance_period_stale"].includes(blocker.code) ? (
                  canClose ? <CalculateMonthForm monthStart={monthStart} propertyId={propertyId} ownerPersonId={ownerPersonId} /> : <p>A staff member with Finance close-period permission must calculate this month.</p>
                ) : ["pending_owner_opening_or_correction", "opening_component_unknown"].includes(blocker.code) && openingAuthority ? (
                  <ReportRemediation label="Review opening balances">{openingAuthority}{canClose && blocker.code === "opening_component_unknown" ? <CalculateMonthForm monthStart={monthStart} propertyId={propertyId} ownerPersonId={ownerPersonId} /> : null}</ReportRemediation>
                ) : blocker.code === "source_allocation_incomplete" && sourceAuthority ? (
                  <ReportRemediation label="Resolve source assignments">{sourceAuthority}{canClose ? <CalculateMonthForm monthStart={monthStart} propertyId={propertyId} ownerPersonId={ownerPersonId} /> : null}</ReportRemediation>
                ) : earlierMonthHref(blocker, monthStart, propertyId, ownerPersonId) ? (
                  <Link className="font-medium underline underline-offset-4" href={earlierMonthHref(blocker, monthStart, propertyId, ownerPersonId)!}>Review earlier month</Link>
                ) : blocker.code === "owner_close_reopen_required" ? (
                  <p>A staff member with reopen permission must prepare a corrected statement.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{blocker.code === "pending_financial_idempotency" ? "Wait for the financial update to finish, then recheck." : "Finance or an Admin must review this check before the month can close."}</p>
                )}
              </div>
              <AuditDetails
                entries={blockerAuditEntries(blocker)}
                label="Technical details"
              />
            </li>
          ))}
        </ul>
      ) : null}

      {readiness.components.length === 4 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="bg-[var(--table-header-bg)] text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2" scope="col">Component</th>
                <th className="px-4 py-2 text-right" scope="col">Opening</th>
                <th className="px-4 py-2 text-right" scope="col">Movement</th>
                <th className="px-4 py-2 text-right" scope="col">Closing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {readiness.components.map((component) => (
                <tr key={component.component}>
                  <th className="px-4 py-2.5 font-medium" scope="row">
                    {OWNER_BALANCE_COMPONENT_LABELS[component.component]}
                  </th>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatExactMoney(component.openingAmount)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatExactMoney(component.movementAmount)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                    {formatExactMoney(component.closingAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <AuditDetails
        className="border-t border-border/60 px-4 py-2"
        entries={[
          { label: "Input watermark", value: readiness.inputWatermark },
          { label: "Input hash", value: readiness.inputHash },
        ]}
      />
    </article>
  );
}

function isCloseableSeriesState(state: OwnerCloseSeriesState | undefined) {
  return state === undefined || state === "open" || state === "preparing";
}

function CalculateMonthForm({ monthStart, propertyId, ownerPersonId }: { monthStart: string; propertyId: string; ownerPersonId: string }) {
  return <ReportActionForm action={calculateReportMonthAction} newCommandLabel="Start a new calculation" successMessage="Calculation finished. Recheck whether all balance checks passed.">
    <input type="hidden" name="propertyId" value={propertyId} />
    <input type="hidden" name="ownerPersonId" value={ownerPersonId} />
    <input type="hidden" name="monthStart" value={monthStart} />
    <input type="hidden" name="currency" value="USD" />
    <input type="hidden" name="idempotencyKey" value={`owner-period-${randomUUID()}`} />
    <Button size="sm" type="submit">Calculate month</Button>
  </ReportActionForm>;
}

function prerequisiteRank(code: string) {
  if (code === "financial_month_not_locked") return 30;
  if (["owner_balance_period_missing", "owner_balance_period_stale"].includes(code)) return 20;
  return 10;
}

function earlierMonthHref(blocker: OwnerCloseBlocker, monthStart: string, propertyId: string, ownerPersonId: string) {
  if (!["prior_period_not_closed", "earlier_dependent_period_stale", "prior_period_not_ready", "prior_period_missing", "prior_period_continuity_broken"].includes(blocker.code)) return;
  const previous = new Date(`${monthStart}T00:00:00Z`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const month = blocker.expected_month_start ?? blocker.month_start ?? previous.toISOString().slice(0, 10);
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(month) || month >= monthStart) return;
  const original = new URLSearchParams({ month: monthStart.slice(0, 7), propertyId, ownerPersonId, view: "statements" });
  const target = new URLSearchParams({ month: month.slice(0, 7), propertyId, ownerPersonId, view: "statements", returnTo: `/balances?${original}` });
  return `/balances?${target}`;
}

function CorrectionForm({
  monthStart,
  revisionId,
}: {
  monthStart: string;
  revisionId: string;
}) {
  return (
    <ReportActionForm
      action={correctReportMonthAction}
      newCommandLabel="Record another correction"
      className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4 md:grid-cols-2 xl:grid-cols-4"
    >
      <input name="revisionId" type="hidden" value={revisionId} />
      <input
        name="idempotencyKey"
        type="hidden"
        value={`owner-close-correction-${randomUUID()}`}
      />
      <div className="md:col-span-2 xl:col-span-4">
        <h3 className="font-semibold">Record close correction</h3>
        <p className="text-sm text-muted-foreground">
          Adds an evidence-backed balance change without editing the prior close.
        </p>
      </div>
      <label className="grid gap-1 text-sm font-medium">
        Component
        <SelectControl
          ariaLabel="Component"
          className="h-10"
          name="component"
          options={OWNER_BALANCE_COMPONENTS.map((component) => ({
            label: OWNER_BALANCE_COMPONENT_LABELS[component],
            value: component,
          }))}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Effective date
        <Input
          className="h-10"
          defaultValue={monthEnd(monthStart)}
          name="effectiveDate"
          required
          type="date"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Signed correction amount
        <Input
          className="h-10"
          inputMode="decimal"
          name="signedAmount"
          placeholder="-25.00"
          required
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Source reference
        <Input className="h-10" minLength={3} name="sourceReference" required />
      </label>
      <label className="grid gap-1 text-sm font-medium md:col-span-2">
        Reason
        <Input className="h-10" minLength={3} name="reason" required />
      </label>
      <label className="grid gap-1 text-sm font-medium md:col-span-2">
        Evidence file fingerprint
        <Input className="h-10 font-mono" minLength={64} name="evidenceSha256" required />
      </label>
      <Button
        className="h-10 px-4 md:col-span-2 xl:col-span-4"
        type="submit"
        variant="outline"
      >
        Record correction
      </Button>
    </ReportActionForm>
  );
}

function RevisionHistory({ data }: { data: OwnerCloseData }) {
  return (
    <section aria-labelledby="owner-close-history-heading" className="space-y-3">
      <div>
        <h3 className="font-semibold" id="owner-close-history-heading">Revision history</h3>
        <p className="text-sm text-muted-foreground">
          Closed revisions remain unchanged after a reopen or correction.
        </p>
      </div>
      {data.revisions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        No close owner month record exists for this scope yet.
        </p>
      ) : data.revisions.map((revision) => (
        <article
          className="overflow-hidden rounded-2xl border border-border/80 bg-card"
          data-testid={`owner-close-revision-${revision.revisionNumber}`}
          key={revision.id}
        >
          <div className="border-b border-border/70 px-4 py-3">
            <h4 className="font-semibold">
              Revision {revision.revisionNumber} - {statusLabel(revision.status)}
            </h4>
            {revision.reopenReason ? (
              <p className="mt-1 text-sm">Reopen reason: {revision.reopenReason}</p>
            ) : null}
            {revision.closeReason ? (
              <p className="mt-1 text-sm">Close reason: {revision.closeReason}</p>
            ) : null}
            <AuditDetails
              className="mt-2"
              entries={[
                { label: "Input hash", value: revision.inputHash ?? "Pending" },
                { label: "Content hash", value: revision.contentHash ?? "Pending" },
              ]}
            />
          </div>
          {revision.lines.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              This preparing revision has not been frozen by close.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {revision.lines.map((line) => <FrozenLine key={line.id} line={line} />)}
            </div>
          )}
        </article>
      ))}
      {data.corrections.length > 0 ? (
        <div className="rounded-2xl border border-border/80 bg-card p-4">
          <h4 className="font-semibold">Recorded corrections</h4>
          <ul className="mt-2 space-y-2 text-sm">
            {data.corrections.map((correction) => (
              <li key={correction.id}>
                <p className="font-medium">
                  {correction.effectiveDate} - {OWNER_BALANCE_COMPONENT_LABELS[correction.component]} - {formatExactMoney(correction.signedAmount)}
                </p>
                <p>{correction.reason} - {correction.sourceReference}</p>
                <AuditDetails entries={[{ label: "Evidence fingerprint", value: correction.evidenceSha256 }]} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function FrozenLine({ line }: { line: OwnerCloseLine }) {
  return (
    <details className="px-4 py-3">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span className="font-medium">{line.lineNumber}. {line.description}</span>
          <span className="tabular-nums">{line.businessDate} - {formatExactMoney(line.signedAmount)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {line.component ? OWNER_BALANCE_COMPONENT_LABELS[line.component] : "Balance activity"}
        </p>
      </summary>
      <ul className="mt-2 space-y-2 border-l border-border pl-3 text-xs">
        {line.sources.map((source) => (
          <li key={source.id}>
            <p className="font-medium">{sourceTypeLabel(source.sourceType)}</p>
            <AuditDetails
              entries={[
                { label: "Source line", value: source.sourceLineId },
                { label: "Source fingerprint", value: source.sourceFingerprint },
              ]}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}

function blockerLabel(blocker: OwnerCloseBlocker) {
  if (blocker.code === "owner_close_reopen_required") {
    return "Reopen is required before another close";
  }
  if (blocker.code === "financial_month_not_locked") return "Financial month is not locked";
  if (blocker.code === "owner_balance_period_missing") return "Owner balance period is missing";
  if (blocker.code === "owner_balance_period_stale") return "Owner balance month must be recalculated";
  if (blocker.code === "pending_owner_opening_or_correction") return "Opening balance review is pending";
  if (blocker.code === "source_allocation_incomplete") return "A transaction has not been assigned to the owner balance";
  if (blocker.code === "opening_component_unknown") return "Starting balances are not complete";
  if (blocker.code === "pending_financial_idempotency") return "A financial update is still pending";
  if (["prior_period_not_closed", "prior_period_not_ready", "prior_period_missing", "prior_period_continuity_broken"].includes(blocker.code)) return "The previous month needs preparation";
  if (blocker.code === "earlier_dependent_period_stale") return "An earlier month has changed";
  if (blocker.code === "source_fingerprint_changed") return "Recorded source activity has changed";
  if (blocker.code === "source_evidence_unreadable") return "Source evidence could not be read";
  if (blocker.code === "opening_evidence_integrity_changed") return "Opening balance evidence has changed";
  if (blocker.code === "owner_statement_artifacts_incomplete") return "Saved statement files are incomplete";
  if (blocker.code === "owner_statement_revision_not_closed") return "Close the owner month before publishing";
  if (blocker.code === "owner_statement_revision_not_current") return "The current closed revision must be published";
  return "This month needs review";
}

function blockerAuditEntries(blocker: OwnerCloseBlocker) {
  return Object.entries(blocker).map(([key, value]) => ({
    label: key.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase()),
    value: value && typeof value === "object" ? "Additional structured detail retained" : String(value ?? "None"),
  }));
}

function statusLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sourceTypeLabel(value: string) {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthEnd(monthStart: string) {
  const date = new Date(`${monthStart}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}

function formatExactMoney(value: string) {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}USD ${grouped}.${fraction}`;
}
