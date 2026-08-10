import { randomUUID } from "node:crypto";
import {
  closeOwnerMonthAction,
  publishOwnerStatementAction,
  recordOwnerCloseCorrectionAction,
  reopenOwnerMonthAction,
} from "@/features/owner-close/actions";
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
};

export function OwnerCloseScreen({
  canClose,
  canPublish = false,
  canReopen,
  data,
  monthStart,
  ownerPersonId,
  propertyId,
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
    (data.series.state === "closed" || data.series.state === "stale");

  return (
    <section aria-labelledby="owner-close-heading" className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold" id="owner-close-heading">
          Owner close authority
        </h2>
        <p className="text-sm text-muted-foreground">
          Readiness, reasoned revisions, frozen lines, and source evidence for this exact owner month.
        </p>
      </header>

      {!hasExactScope || !data.readiness ? (
        <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          Select an exact property and owner assignment to inspect close readiness.
        </div>
      ) : (
        <>
          <ReadinessCard data={data} closeRevisionNumber={closeRevisionNumber} />

          {mayClose ? (
            <form
              action={closeOwnerMonthAction}
              className="grid gap-3 rounded-2xl border border-emerald-300/70 bg-emerald-50/60 p-4 md:grid-cols-[1fr_auto]"
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
                <input
                  className="h-10 rounded-lg border border-input bg-background px-3"
                  minLength={3}
                  name="closeReason"
                  required
                />
              </label>
              <button
                className="self-end rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                type="submit"
              >
                Close revision {closeRevisionNumber}
              </button>
            </form>
          ) : null}

          {mayReopen ? (
            <form
              action={reopenOwnerMonthAction}
              className="grid gap-3 rounded-2xl border border-amber-300/70 bg-amber-50/60 p-4 md:grid-cols-[1fr_auto]"
            >
              <input name="seriesId" type="hidden" value={data.series!.id} />
              <input
                name="idempotencyKey"
                type="hidden"
                value={`owner-reopen-${randomUUID()}`}
              />
              <label className="grid gap-1 text-sm font-medium">
                Reopen reason
                <input
                  className="h-10 rounded-lg border border-input bg-background px-3"
                  minLength={3}
                  name="reopenReason"
                  required
                />
              </label>
              <button
                className="self-end rounded-lg border border-amber-500 bg-background px-4 py-2.5 text-sm font-semibold"
                type="submit"
              >
                Reopen month
              </button>
            </form>
          ) : null}

          {canReopen && preparingRevision ? (
            <CorrectionForm monthStart={monthStart} revisionId={preparingRevision.id} />
          ) : null}

          <PublicationAuthority canPublish={canPublish} data={data} />

          <RevisionHistory data={data} />
        </>
      )}
    </section>
  );
}

function PublicationAuthority({
  canPublish,
  data,
}: {
  canPublish: boolean;
  data: OwnerCloseData;
}) {
  const readiness = data.publicationReadiness;
  const publications = data.publications ?? [];
  return (
    <section aria-labelledby="owner-statement-publication-heading" className="space-y-3">
      <div>
        <h3 className="font-semibold" id="owner-statement-publication-heading">
          Official Owner Statements
        </h3>
        <p className="text-sm text-muted-foreground">
          Numbered publications and retained PDF and Excel bytes from immutable close evidence.
        </p>
      </div>

      {canPublish && readiness?.isReady ? (
        <form
          action={publishOwnerStatementAction}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300/70 bg-emerald-50/60 p-4"
        >
          <input name="revisionId" type="hidden" value={readiness.revisionId} />
          <input
            name="idempotencyKey"
            type="hidden"
            value={`owner-statement-${readiness.revisionId}-${randomUUID()}`}
          />
          <div>
            <p className="font-semibold">Ready to publish official Owner Statement</p>
            <p className="text-sm text-muted-foreground">
              Publication freezes a permanent statement number and retained artifacts.
            </p>
          </div>
          <button
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            type="submit"
          >
            Publish Owner Statement
          </button>
        </form>
      ) : readiness && readiness.blockers.length > 0 ? (
        <div className="rounded-2xl border border-border/80 bg-card p-4 text-sm">
          <p className="font-semibold">Publication blocked</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {readiness.blockers.map((blocker, index) => (
              <li key={`${blocker.code}:${index}`}>{blockerLabel(blocker)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {publications.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No official Owner Statement has been published for this owner month.
        </p>
      ) : (
        <div className="space-y-2">
          {publications.map((publication) => (
            <article
              className="rounded-2xl border border-border/80 bg-card p-4"
              key={publication.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold">{publication.statementNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    Revision {publication.revisionNumber} · {publication.generatedAt}
                  </p>
                  <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                    {publication.contentHash}
                  </p>
                </div>
                <span className="rounded-full border border-border px-2 py-1 text-xs font-medium">
                  {publication.supersededByPublicationId ? "Superseded" : "Current"}
                </span>
              </div>
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
          ))}
        </div>
      )}
    </section>
  );
}

function ReadinessCard({
  closeRevisionNumber,
  data,
}: {
  closeRevisionNumber: number;
  data: OwnerCloseData;
}) {
  const readiness = data.readiness!;
  const scopeIsCloseReady = readiness.isReady &&
    isCloseableSeriesState(data.series?.state);
  return (
    <article
      className="overflow-hidden rounded-2xl border border-border/80 bg-card"
      data-testid="owner-close-readiness"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div>
          <h3 className="font-semibold">
            {scopeIsCloseReady
              ? `Ready to close revision ${closeRevisionNumber}`
              : "Close readiness blocked"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Series state: {data.series?.state ?? readiness.seriesState ?? "not started"}
          </p>
        </div>
        <p className="text-xs font-medium uppercase tracking-wide">
          {readiness.blockers.length} blocker{readiness.blockers.length === 1 ? "" : "s"}
        </p>
      </div>

      {readiness.blockers.length > 0 ? (
        <ul className="space-y-2 border-b border-border/60 bg-amber-50/60 px-4 py-3 text-sm">
          {readiness.blockers.map((blocker, index) => (
            <li key={`${blocker.code}:${index}`}>
              <p className="font-semibold text-amber-950">{blockerLabel(blocker)}</p>
              <p className="font-mono text-[11px] text-amber-900">{blocker.code}</p>
              <p className="break-all font-mono text-[11px] text-muted-foreground">
                {JSON.stringify(blocker)}
              </p>
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
      <div className="space-y-1 border-t border-border/60 px-4 py-2 font-mono text-[11px] text-muted-foreground">
        <p>Input watermark: {readiness.inputWatermark ?? "Unavailable"}</p>
        <p className="break-all">Input hash: {readiness.inputHash ?? "Unavailable"}</p>
      </div>
    </article>
  );
}

function isCloseableSeriesState(state: OwnerCloseSeriesState | undefined) {
  return state === undefined || state === "open" || state === "preparing";
}

function CorrectionForm({
  monthStart,
  revisionId,
}: {
  monthStart: string;
  revisionId: string;
}) {
  return (
    <form
      action={recordOwnerCloseCorrectionAction}
      className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4 md:grid-cols-2 xl:grid-cols-4"
    >
      <input name="revisionId" type="hidden" value={revisionId} />
      <input
        name="idempotencyKey"
        type="hidden"
        value={`owner-close-correction-${randomUUID()}`}
      />
      <div className="md:col-span-2 xl:col-span-4">
        <h3 className="font-semibold">Append-only close correction</h3>
        <p className="text-sm text-muted-foreground">
          Adds evidence-backed movement to the preparing revision; it never edits the prior close.
        </p>
      </div>
      <label className="grid gap-1 text-sm font-medium">
        Component
        <select className="h-10 rounded-lg border border-input bg-background px-3" name="component">
          {OWNER_BALANCE_COMPONENTS.map((component) => (
            <option key={component} value={component}>
              {OWNER_BALANCE_COMPONENT_LABELS[component]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Effective date
        <input
          className="h-10 rounded-lg border border-input bg-background px-3"
          defaultValue={monthEnd(monthStart)}
          name="effectiveDate"
          required
          type="date"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Signed correction amount
        <input
          className="h-10 rounded-lg border border-input bg-background px-3"
          inputMode="decimal"
          name="signedAmount"
          placeholder="-25.00"
          required
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Source reference
        <input className="h-10 rounded-lg border border-input bg-background px-3" minLength={3} name="sourceReference" required />
      </label>
      <label className="grid gap-1 text-sm font-medium md:col-span-2">
        Reason
        <input className="h-10 rounded-lg border border-input bg-background px-3" minLength={3} name="reason" required />
      </label>
      <label className="grid gap-1 text-sm font-medium md:col-span-2">
        Evidence SHA-256
        <input className="h-10 rounded-lg border border-input bg-background px-3 font-mono" minLength={64} name="evidenceSha256" required />
      </label>
      <button
        className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold md:col-span-2 xl:col-span-4"
        type="submit"
      >
        Record correction
      </button>
    </form>
  );
}

function RevisionHistory({ data }: { data: OwnerCloseData }) {
  return (
    <section aria-labelledby="owner-close-history-heading" className="space-y-3">
      <div>
        <h3 className="font-semibold" id="owner-close-history-heading">Revision history</h3>
        <p className="text-sm text-muted-foreground">
          Closed revisions remain byte-for-byte database evidence after reopen and correction.
        </p>
      </div>
      {data.revisions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No close revision exists for this scope yet.
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
            <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
              <div><dt className="inline font-medium">Input hash</dt><dd className="ml-2 inline break-all font-mono">{revision.inputHash ?? "Pending"}</dd></div>
              <div><dt className="inline font-medium">Content hash</dt><dd className="ml-2 inline break-all font-mono">{revision.contentHash ?? "Pending"}</dd></div>
            </dl>
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
                <p className="break-all font-mono text-[11px] text-muted-foreground">{correction.evidenceSha256}</p>
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
    <details className="px-4 py-3" open>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span className="font-medium">{line.lineNumber}. {line.description}</span>
          <span className="tabular-nums">{line.businessDate} - {formatExactMoney(line.signedAmount)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {line.lineKind}{line.component ? ` - ${OWNER_BALANCE_COMPONENT_LABELS[line.component]}` : ""}
        </p>
      </summary>
      <ul className="mt-2 space-y-2 border-l border-border pl-3 text-xs">
        {line.sources.map((source) => (
          <li key={source.id}>
            <p className="font-medium">{sourceTypeLabel(source.sourceType)}</p>
            <p className="break-all font-mono">Source line {source.sourceLineId}</p>
            <p className="break-all font-mono text-muted-foreground">Fingerprint {source.sourceFingerprint}</p>
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
  if (blocker.code === "owner_balance_period_stale") return "Owner balance period must be rerolled";
  if (blocker.code === "pending_owner_opening_or_correction") return "Opening authority review is pending";
  if (blocker.code === "source_allocation_incomplete") return "Source allocation is incomplete";
  if (blocker.code === "pending_financial_idempotency") return "A financial command is still pending";
  return blocker.code.replaceAll("_", " ");
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
