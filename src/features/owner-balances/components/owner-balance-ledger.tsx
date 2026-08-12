import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  allocateOwnerEventAction,
  generateOwnerBalancePeriodAction,
  recordOwnerCashEventAction,
  recordOwnerDistributionAction,
  reverseOwnerInvoicePaymentAction,
  reversePropertyWithdrawalAction,
  transferOwnerBalanceComponentAction,
} from "@/features/owner-balances/lifecycle-actions";
import {
  OWNER_BALANCE_COMPONENT_LABELS,
  OWNER_BALANCE_COMPONENTS,
  type OwnerBalanceData,
  type OwnerEventAllocationQueueRecord,
} from "@/features/owner-balances/owner-balance.types";

type OwnerBalanceLedgerProps = {
  canAllocate: boolean;
  canCorrect: boolean;
  canTransfer: boolean;
  closingAuthority?: ReactNode;
  data: OwnerBalanceData;
  openingAuthority?: ReactNode;
  organizationName: string;
  selectedMonth: string;
  selectedOwnerPersonId?: string;
  selectedPropertyId?: string;
};

export function OwnerBalanceLedger({
  canAllocate,
  canCorrect,
  canTransfer,
  closingAuthority,
  data,
  openingAuthority,
  organizationName,
  selectedMonth,
  selectedOwnerPersonId,
  selectedPropertyId,
}: OwnerBalanceLedgerProps) {
  const hasExactScope = Boolean(selectedPropertyId && selectedOwnerPersonId);
  const scopedHiddenFields = hasExactScope ? (
    <>
      <input name="propertyId" type="hidden" value={selectedPropertyId} />
      <input name="ownerPersonId" type="hidden" value={selectedOwnerPersonId} />
      <input name="currency" type="hidden" value="USD" />
    </>
  ) : null;

  return (
    <main className="space-y-5 pb-12">
      <header className="rounded-2xl border border-border/80 bg-card px-5 py-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {organizationName} · Owner authority
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Authoritative owner balance
        </h1>
        <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
          Persisted opening, movement, and closing values for all four components.
          No current-primary-owner projection or presentation-time balancing plug is used.
        </p>
      </header>

      <form className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4 md:grid-cols-[1fr_1fr_11rem_auto]" method="get">
        <label className="grid gap-1 text-sm font-medium">
          Property
          <select
            className="h-10 rounded-lg border border-input bg-background px-3"
            defaultValue={selectedPropertyId ?? ""}
            name="propertyId"
          >
            <option value="">Select property</option>
            {data.propertyOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Owner assignment
          <select
            className="h-10 rounded-lg border border-input bg-background px-3"
            defaultValue={selectedOwnerPersonId ?? ""}
            name="ownerPersonId"
          >
            <option value="">Select owner</option>
            {data.ownerOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Month
          <input
            className="h-10 rounded-lg border border-input bg-background px-3"
            defaultValue={selectedMonth}
            name="month"
            type="month"
          />
        </label>
        <button className="self-end rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground" type="submit">
          Load authority
        </button>
      </form>

      {openingAuthority}

      {closingAuthority}

      {!hasExactScope ? (
        <section className="rounded-2xl border border-amber-300/60 bg-amber-50/70 p-5 text-sm text-amber-950">
          <h2 className="font-semibold">Exact authority scope required</h2>
          <p className="mt-1">
            Select an exact property and owner assignment. Nestory will not guess from a
            current primary owner.
          </p>
        </section>
      ) : (
        <>
          {canAllocate ? (
            <form action={generateOwnerBalancePeriodAction} className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/80 bg-card p-4">
              {scopedHiddenFields}
              <input name="monthStart" type="hidden" value={`${selectedMonth}-01`} />
              <input name="idempotencyKey" type="hidden" value={`owner-period-${randomUUID()}`} />
              <div className="mr-auto">
                <h2 className="font-semibold">Roll-forward authority</h2>
                <p className="text-sm text-muted-foreground">Generate or recompute this open month from persisted inputs.</p>
              </div>
              <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" type="submit">
                Generate month
              </button>
            </form>
          ) : null}

          <WithdrawalCapacityCard capacity={data.withdrawalCapacity} />

          <section aria-labelledby="owner-periods-heading" className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold" id="owner-periods-heading">Four-component periods</h2>
              <p className="text-sm text-muted-foreground">Every ready, stale, or closed period must carry all four persisted components.</p>
            </div>
            {data.periods.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                    No authoritative period exists for this scope. Generate the month after the opening balance and source remediation are complete.
              </p>
            ) : data.periods.map((period) => (
              <article className="overflow-hidden rounded-2xl border border-border/80 bg-card" data-testid={`owner-period-${period.monthStart}`} key={period.id}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
                  <div>
                    <h3 className="font-semibold">{formatMonth(period.monthStart)}</h3>
                    <p className="text-xs text-muted-foreground">Status: <span className="font-medium uppercase">{period.status}</span></p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold">Held cash closing: {period.availableWithdrawal === null ? "Unavailable" : formatExactMoney(period.availableWithdrawal)}</p>
                    <p className="text-xs text-muted-foreground">Input watermark: {period.inputWatermark ?? "Not ready"}</p>
                  </div>
                </div>
                {period.components.length > 0 ? (
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
                        {period.components.map((component) => (
                          <tr key={component.component}>
                            <th className="px-4 py-2.5 font-medium" scope="row">{OWNER_BALANCE_COMPONENT_LABELS[component.component]}</th>
                            <td className="px-4 py-2.5 text-right tabular-nums">{formatExactMoney(component.openingAmount)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{formatExactMoney(component.movementAmount)}</td>
                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatExactMoney(component.closingAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="bg-amber-50/70 px-4 py-4 text-sm text-amber-950">
                    <p className="font-semibold">{remediationLabel(period.blockedReasonCode)}</p>
                    <p className="mt-1 font-mono text-xs">{period.blockedReasonCode ?? "authority_blocked"}</p>
                    <JsonDetail value={period.blockedReasonDetail} />
                  </div>
                )}
                <p className="border-t border-border/60 px-4 py-2 font-mono text-xs text-muted-foreground">
                  Input hash: {period.inputHash ?? "Not available until ready"}
                </p>
              </article>
            ))}
          </section>

          <section aria-labelledby="owner-remediation-heading" className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold" id="owner-remediation-heading">Source allocation and remediation</h2>
              <p className="text-sm text-muted-foreground">Every supported source is allocated exactly once or remains visibly blocked.</p>
            </div>
            {data.queue.length === 0 ? (
              <p className="rounded-2xl border border-border/80 bg-card p-4 text-sm text-muted-foreground">No source allocation exceptions in this period.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card">
                <table className="w-full min-w-[56rem] text-left text-sm">
                  <thead className="bg-[var(--table-header-bg)] text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2" scope="col">Event</th>
                      <th className="px-4 py-2" scope="col">Source</th>
                      <th className="px-4 py-2 text-right" scope="col">Amount</th>
                      <th className="px-4 py-2" scope="col">State / remediation</th>
                      <th className="px-4 py-2" scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {data.queue.map((item) => (
                      <RemediationRow
                        canAllocate={canAllocate}
                        item={item}
                        key={`${item.sourceType}:${item.sourceLineId}`}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="owner-sources-heading" className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold" id="owner-sources-heading">Source drill-through</h2>
              <p className="text-sm text-muted-foreground">Immutable source fingerprints, owner snapshots, component movements, and reversal links.</p>
            </div>
            <div className="space-y-2">
              {data.sources.map((source) => (
                <details className="rounded-xl border border-border/80 bg-card" data-testid={`owner-source-${source.allocationSetId}`} key={source.allocationSetId} open>
                  <summary className="cursor-pointer list-none px-4 py-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-semibold">{sourceTypeLabel(source.sourceType)}</span>
                      <span className="tabular-nums">{source.eventDate} · {formatExactMoney(source.allocatedGrossSignedAmount)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Roster {source.ownershipPercentSnapshot}% · {source.allocationBasis.replaceAll("_", " ")}</p>
                  </summary>
                  <div className="space-y-2 border-t border-border/60 px-4 py-3 text-xs">
                    <p className="font-mono break-all">Source {source.sourceType}:{source.sourceLineId}</p>
                    <p className="font-mono break-all">Source fingerprint: {source.sourceFingerprint}</p>
                    <p className="font-mono break-all">Roster hash: {source.ownershipRosterHash}</p>
                    {source.reversalOfAllocationSetId ? (
                      <p className="font-medium text-amber-800">Reverses allocation set {source.reversalOfAllocationSetId}</p>
                    ) : null}
                    <ul className="space-y-1">
                      {source.movements.length === 0 ? (
                        <li className="text-muted-foreground">Activity only — no owner component movement.</li>
                      ) : source.movements.map((movement) => (
                        <li className="flex flex-wrap justify-between gap-2" key={movement.id}>
                          <span>{OWNER_BALANCE_COMPONENT_LABELS[movement.component]} {formatSignedExactMoney(movement.signedAmount)}</span>
                          {movement.reversalOfMovementId ? <span>Reverses movement {movement.reversalOfMovementId}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              ))}
            </div>
          </section>

          {canCorrect ? (
            <OwnerCashActions
              scopedHiddenFields={scopedHiddenFields}
              selectedMonth={selectedMonth}
            />
          ) : null}

          {canTransfer ? (
            <TransferAction
              ownerOptions={data.ownerOptions}
              scopedHiddenFields={scopedHiddenFields}
              selectedMonth={selectedMonth}
              selectedOwnerPersonId={selectedOwnerPersonId!}
            />
          ) : null}
        </>
      )}
    </main>
  );
}

function WithdrawalCapacityCard({
  capacity,
}: {
  capacity: OwnerBalanceData["withdrawalCapacity"];
}) {
  const available = capacity?.status === "available" &&
    capacity.availableWithdrawal !== null;

  return (
    <section
      className="rounded-2xl border border-border/80 bg-card p-4"
      data-testid="owner-withdrawal-capacity"
    >
      <h2 className="font-semibold">
        {available
          ? "Current checked withdrawal capacity"
          : "Withdrawal capacity unavailable"}
      </h2>
      {available ? (
        <>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {formatExactMoney(capacity.availableWithdrawal!)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            As of {capacity.asOfDate} · Committed or reserved: {formatExactMoney(capacity.committedReserved)}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          This period is not eligible for a current withdrawal check.
        </p>
      )}
    </section>
  );
}

function RemediationRow({ canAllocate, item }: { canAllocate: boolean; item: OwnerEventAllocationQueueRecord }) {
  const setupPath = remediationSetupPath(item.remediationDetail);
  return (
    <tr data-testid={`owner-remediation-${item.sourceLineId}`}>
      <td className="px-4 py-3">{item.eventDate}</td>
      <td className="px-4 py-3">
        <p className="font-medium">{sourceTypeLabel(item.sourceType)}</p>
        <p className="font-mono text-xs text-muted-foreground">{item.sourceLineId}</p>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{formatExactMoney(item.grossSignedAmount)}</td>
      <td className="px-4 py-3">
        <p className="font-semibold">{remediationLabel(item.remediationCode)}</p>
        <p className="font-mono text-xs text-muted-foreground">{item.remediationCode ?? item.allocationState}</p>
        <JsonDetail value={item.remediationDetail} />
      </td>
      <td className="px-4 py-3">
        {setupPath ? <Link className="text-sm font-semibold text-primary underline-offset-4 hover:underline" href={setupPath}>Resolve ownership</Link> : null}
        {canAllocate && item.allocationState !== "allocated" ? (
          <form action={allocateOwnerEventAction} className="mt-2">
            <input name="sourceType" type="hidden" value={item.sourceType} />
            <input name="sourceLineId" type="hidden" value={item.sourceLineId} />
            <input name="idempotencyKey" type="hidden" value={`owner-allocate-${randomUUID()}`} />
            <button className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold" type="submit">Allocate source</button>
          </form>
        ) : null}
      </td>
    </tr>
  );
}

function OwnerCashActions({ scopedHiddenFields, selectedMonth }: { scopedHiddenFields: ReactNode; selectedMonth: string }) {
  return (
    <section aria-labelledby="owner-cash-actions-heading" className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold" id="owner-cash-actions-heading">Checked owner cash</h2>
        <p className="text-sm text-muted-foreground">Contributions, reimbursements, distributions, and reversals remain distinct commands.</p>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        {(["owner_contribution", "owner_reimbursement"] as const).map((eventType) => (
          <form action={recordOwnerCashEventAction} className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4" key={eventType}>
            {scopedHiddenFields}
            <input name="eventType" type="hidden" value={eventType} />
            <input name="idempotencyKey" type="hidden" value={`owner-cash-${randomUUID()}`} />
            <h3 className="font-semibold">{eventType === "owner_contribution" ? "Owner contribution" : "Owner reimbursement"}</h3>
            <MoneyAndDateFields dateName="eventDate" selectedMonth={selectedMonth} />
            <label className="grid gap-1 text-sm">Reason<input className="h-9 rounded-md border border-input bg-background px-3" minLength={3} name="reason" required /></label>
            <button className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground" type="submit">
              {eventType === "owner_contribution" ? "Record owner contribution" : "Record owner reimbursement"}
            </button>
          </form>
        ))}
        <form action={recordOwnerDistributionAction} className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4">
          {scopedHiddenFields}
          <input name="idempotencyKey" type="hidden" value={`owner-distribution-${randomUUID()}`} />
          <h3 className="font-semibold">Owner distribution</h3>
          <MoneyAndDateFields dateName="distributionDate" selectedMonth={selectedMonth} />
          <label className="grid gap-1 text-sm">Reference<input className="h-9 rounded-md border border-input bg-background px-3" name="reference" required /></label>
          <button className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground" type="submit">Record owner distribution</button>
        </form>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <ReversalForm action={reverseOwnerInvoicePaymentAction} idLabel="Owner invoice payment ID" idName="ownerPaymentId" selectedMonth={selectedMonth} submitLabel="Reverse owner invoice payment" />
        <ReversalForm action={reversePropertyWithdrawalAction} idLabel="Owner distribution ID" idName="withdrawalId" selectedMonth={selectedMonth} submitLabel="Reverse owner distribution" />
      </div>
    </section>
  );
}

function ReversalForm({ action, idLabel, idName, selectedMonth, submitLabel }: { action: (formData: FormData) => Promise<void>; idLabel: string; idName: string; selectedMonth: string; submitLabel: string }) {
  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4">
      <input name="idempotencyKey" type="hidden" value={`owner-reversal-${randomUUID()}`} />
      <h3 className="font-semibold">{submitLabel}</h3>
      <label className="grid gap-1 text-sm">{idLabel}<input className="h-9 rounded-md border border-input bg-background px-3" name={idName} required /></label>
      <label className="grid gap-1 text-sm">Reversal date<input className="h-9 rounded-md border border-input bg-background px-3" defaultValue={`${selectedMonth}-01`} name="reversalDate" required type="date" /></label>
      <label className="grid gap-1 text-sm">Reason<input className="h-9 rounded-md border border-input bg-background px-3" minLength={3} name="reason" required /></label>
      <button className="rounded-lg border border-border px-3 py-2 text-sm font-semibold" type="submit">{submitLabel}</button>
    </form>
  );
}

function TransferAction({ ownerOptions, scopedHiddenFields, selectedMonth, selectedOwnerPersonId }: { ownerOptions: OwnerBalanceData["ownerOptions"]; scopedHiddenFields: ReactNode; selectedMonth: string; selectedOwnerPersonId: string }) {
  return (
    <section aria-labelledby="owner-transfer-heading" className="rounded-2xl border border-border/80 bg-card p-4">
      <h2 className="text-lg font-semibold" id="owner-transfer-heading">Explicit ownership transfer</h2>
      <p className="mt-1 text-sm text-muted-foreground">Super Admin only. The instruction persists equal opposite movements with evidence.</p>
      <form action={transferOwnerBalanceComponentAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {scopedHiddenFields}
        <input name="fromOwnerPersonId" type="hidden" value={selectedOwnerPersonId} />
        <input name="idempotencyKey" type="hidden" value={`owner-transfer-${randomUUID()}`} />
        <label className="grid gap-1 text-sm">To owner<select className="h-9 rounded-md border border-input bg-background px-3" name="toOwnerPersonId" required><option value="">Select owner</option>{ownerOptions.filter((item) => item.id !== selectedOwnerPersonId).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Component<select className="h-9 rounded-md border border-input bg-background px-3" name="component" required>{OWNER_BALANCE_COMPONENTS.map((component) => <option key={component} value={component}>{OWNER_BALANCE_COMPONENT_LABELS[component]}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Amount<input className="h-9 rounded-md border border-input bg-background px-3" inputMode="decimal" name="amount" required /></label>
        <label className="grid gap-1 text-sm">Effective date<input className="h-9 rounded-md border border-input bg-background px-3" defaultValue={`${selectedMonth}-01`} name="effectiveDate" required type="date" /></label>
        <label className="grid gap-1 text-sm xl:col-span-2">Reason<input className="h-9 rounded-md border border-input bg-background px-3" minLength={3} name="reason" required /></label>
        <label className="grid gap-1 text-sm">Evidence reference<input className="h-9 rounded-md border border-input bg-background px-3" minLength={3} name="evidenceReference" required /></label>
        <label className="grid gap-1 text-sm">Evidence SHA-256<input className="h-9 rounded-md border border-input bg-background px-3 font-mono" minLength={64} name="evidenceSha256" required /></label>
        <button className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground md:col-span-2 xl:col-span-4" type="submit">Transfer component</button>
      </form>
    </section>
  );
}

function MoneyAndDateFields({ dateName, selectedMonth }: { dateName: string; selectedMonth: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="grid gap-1 text-sm">Amount<input className="h-9 rounded-md border border-input bg-background px-3" inputMode="decimal" name="amount" required /></label>
      <label className="grid gap-1 text-sm">Date<input className="h-9 rounded-md border border-input bg-background px-3" defaultValue={`${selectedMonth}-01`} name={dateName} required type="date" /></label>
    </div>
  );
}

function JsonDetail({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  return <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{JSON.stringify(value)}</p>;
}

function remediationSetupPath(value: unknown) {
  if (!value || typeof value !== "object" || !("setup_path" in value)) return null;
  const setupPath = (value as { setup_path?: unknown }).setup_path;
  return typeof setupPath === "string" && setupPath.startsWith("/properties/")
    ? setupPath
    : null;
}

function remediationLabel(code: string | null) {
  if (code?.startsWith("owner_roster_") || code === "ambiguous_event_ownership") {
    return "Ownership needs resolution";
  }
  if (code === "source_fingerprint_drift") return "Source changed after allocation";
  if (code === "unresolved_transfer") return "Transfer instruction required";
  if (code === "source_unsupported") return "Unsupported owner source";
  return code ? "Authority needs remediation" : "Authority ready";
}

function sourceTypeLabel(value: string) {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatMonth(value: string) {
  return `${value.slice(0, 4)}-${value.slice(5, 7)}`;
}

function formatSignedExactMoney(value: string) {
  return value.startsWith("-") ? formatExactMoney(value) : `+${formatExactMoney(value)}`;
}

function formatExactMoney(value: string) {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}USD ${grouped}.${fraction}`;
}
