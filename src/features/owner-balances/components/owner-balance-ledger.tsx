import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import Link from "next/link";
import { AuditDetails } from "@/components/ui/audit-details";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
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
          {organizationName} · Owner balances
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Owner balances
        </h1>
        <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
          Monthly opening, activity, and closing balances for the selected property and owner.
        </p>
      </header>

      <form className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4 md:grid-cols-[1fr_1fr_11rem_auto]" method="get">
        <label className="grid gap-1 text-sm font-medium">
          Property
          <SelectControl
            ariaLabel="Property"
            className="h-10"
            defaultValue={selectedPropertyId ?? ""}
            name="propertyId"
            options={[
              { label: "Select property", value: "" },
              ...data.propertyOptions.map((option) => ({ label: option.label, value: option.id })),
            ]}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Owner assignment
          <SelectControl
            ariaLabel="Owner assignment"
            className="h-10"
            defaultValue={selectedOwnerPersonId ?? ""}
            name="ownerPersonId"
            options={[
              { label: "Select owner", value: "" },
              ...data.ownerOptions.map((option) => ({ label: option.label, value: option.id })),
            ]}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Month
          <Input
            className="h-10"
            defaultValue={selectedMonth}
            name="month"
            type="month"
          />
        </label>
        <Button className="h-10 self-end px-4" type="submit">
          Load balances
        </Button>
      </form>

      {openingAuthority}

      {closingAuthority}

      {!hasExactScope ? (
        <section className="rounded-2xl border border-amber-300/60 bg-amber-50/70 p-5 text-sm text-amber-950">
          <h2 className="font-semibold">Select a property and owner</h2>
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
                <h2 className="font-semibold">Calculate month</h2>
                <p className="text-sm text-muted-foreground">Calculate this open month from approved opening balances and recorded activity.</p>
              </div>
              <Button className="h-9 px-4" type="submit">
                Generate month
              </Button>
            </form>
          ) : null}

          <WithdrawalCapacityCard capacity={data.withdrawalCapacity} />

          <section aria-labelledby="owner-periods-heading" className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold" id="owner-periods-heading">Monthly balances</h2>
            </div>
            {data.periods.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                No monthly balance exists. Approve the opening balances and resolve source issues, then calculate the month.
              </p>
            ) : data.periods.map((period) => (
              <article className="overflow-hidden rounded-2xl border border-border/80 bg-card" data-testid={`owner-period-${period.monthStart}`} key={period.id}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
                  <div>
                    <h3 className="font-semibold">{formatMonth(period.monthStart)}</h3>
                    <p className="text-xs text-muted-foreground">Status: <span className="font-medium uppercase">{period.status}</span></p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold">Available owner cash: {period.availableWithdrawal === null ? "Unavailable" : formatExactMoney(period.availableWithdrawal)}</p>
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
                    <AuditDetails
                      className="mt-2"
                      entries={[
                        { label: "Reason code", value: period.blockedReasonCode },
                        ...auditEntries(period.blockedReasonDetail),
                      ]}
                      label="Technical details"
                    />
                  </div>
                )}
                <AuditDetails
                  className="border-t border-border/60 px-4 py-2"
                  entries={[
                    { label: "Input watermark", value: period.inputWatermark },
                    { label: "Input hash", value: period.inputHash },
                  ]}
                />
              </article>
            ))}
          </section>

          <section aria-labelledby="owner-remediation-heading" className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold" id="owner-remediation-heading">Source issues</h2>
              <p className="text-sm text-muted-foreground">Each supported transaction must be assigned once before the month can close.</p>
            </div>
            {data.queue.length === 0 ? (
              <p className="rounded-2xl border border-border/80 bg-card p-4 text-sm text-muted-foreground">No source issues in this month.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card">
                <table className="w-full min-w-[56rem] text-left text-sm">
                  <thead className="bg-[var(--table-header-bg)] text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2" scope="col">Event</th>
                      <th className="px-4 py-2" scope="col">Source</th>
                      <th className="px-4 py-2 text-right" scope="col">Amount</th>
                      <th className="px-4 py-2" scope="col">Status</th>
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
              <h2 className="text-lg font-semibold" id="owner-sources-heading">Balance sources</h2>
            </div>
            <div className="space-y-2">
              {data.sources.map((source) => (
                <details className="rounded-xl border border-border/80 bg-card" data-testid={`owner-source-${source.allocationSetId}`} key={source.allocationSetId}>
                  <summary className="cursor-pointer list-none px-4 py-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-semibold">{sourceTypeLabel(source.sourceType)}</span>
                      <span className="tabular-nums">{source.eventDate} · {formatExactMoney(source.allocatedGrossSignedAmount)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Ownership at event {source.ownershipPercentSnapshot}% · {source.allocationBasis.replaceAll("_", " ")}</p>
                  </summary>
                  <div className="space-y-2 border-t border-border/60 px-4 py-3 text-xs">
                    {source.reversalOfAllocationSetId ? (
                      <p className="font-medium text-warning">Reverses an earlier balance assignment.</p>
                    ) : null}
                    <ul className="space-y-1">
                      {source.movements.length === 0 ? (
                        <li className="text-muted-foreground">Activity only — no owner component movement.</li>
                      ) : source.movements.map((movement) => (
                        <li className="flex flex-wrap justify-between gap-2" key={movement.id}>
                          <span>{OWNER_BALANCE_COMPONENT_LABELS[movement.component]} {formatSignedExactMoney(movement.signedAmount)}</span>
                          {movement.reversalOfMovementId ? <span>Reversal</span> : null}
                        </li>
                      ))}
                    </ul>
                    <AuditDetails
                      entries={[
                        { label: "Source type", value: source.sourceType },
                        { label: "Source line", value: source.sourceLineId },
                        { label: "Source fingerprint", value: source.sourceFingerprint },
                        { label: "Ownership hash", value: source.ownershipRosterHash },
                        { label: "Reversed assignment", value: source.reversalOfAllocationSetId },
                      ]}
                    />
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
          ? "Available to distribute"
          : "Distribution amount unavailable"}
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
          This month is not ready for an owner distribution.
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
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{formatExactMoney(item.grossSignedAmount)}</td>
      <td className="px-4 py-3">
        <p className="font-semibold">{remediationLabel(item.remediationCode)}</p>
        <AuditDetails
          className="mt-1"
          entries={[
            { label: "Source line", value: item.sourceLineId },
            { label: "Reason code", value: item.remediationCode ?? item.allocationState },
            ...auditEntries(item.remediationDetail),
          ]}
          label="Technical details"
        />
      </td>
      <td className="px-4 py-3">
        {setupPath ? <Link className="text-sm font-semibold text-primary underline-offset-4 hover:underline" href={setupPath}>Resolve ownership</Link> : null}
        {canAllocate && item.allocationState !== "allocated" ? (
          <form action={allocateOwnerEventAction} className="mt-2">
            <input name="sourceType" type="hidden" value={item.sourceType} />
            <input name="sourceLineId" type="hidden" value={item.sourceLineId} />
            <input name="idempotencyKey" type="hidden" value={`owner-allocate-${randomUUID()}`} />
            <Button size="sm" type="submit" variant="outline">Assign to owner balance</Button>
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
        <h2 className="text-lg font-semibold" id="owner-cash-actions-heading">Owner cash activity</h2>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        {(["owner_contribution", "owner_reimbursement"] as const).map((eventType) => (
          <form action={recordOwnerCashEventAction} className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4" key={eventType}>
            {scopedHiddenFields}
            <input name="eventType" type="hidden" value={eventType} />
            <input name="idempotencyKey" type="hidden" value={`owner-cash-${randomUUID()}`} />
            <h3 className="font-semibold">{eventType === "owner_contribution" ? "Owner contribution" : "Owner reimbursement"}</h3>
            <MoneyAndDateFields dateName="eventDate" selectedMonth={selectedMonth} />
            <label className="grid gap-1 text-sm">Reason<Input className="h-9" minLength={3} name="reason" required /></label>
            <Button className="h-9 px-3" type="submit">
              {eventType === "owner_contribution" ? "Record owner contribution" : "Record owner reimbursement"}
            </Button>
          </form>
        ))}
        <form action={recordOwnerDistributionAction} className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4">
          {scopedHiddenFields}
          <input name="idempotencyKey" type="hidden" value={`owner-distribution-${randomUUID()}`} />
          <h3 className="font-semibold">Owner distribution</h3>
          <MoneyAndDateFields dateName="distributionDate" selectedMonth={selectedMonth} />
          <label className="grid gap-1 text-sm">Reference<Input className="h-9" name="reference" required /></label>
          <Button className="h-9 px-3" type="submit">Record owner distribution</Button>
        </form>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <ReversalForm action={reverseOwnerInvoicePaymentAction} idLabel="Owner invoice payment reference" idName="ownerPaymentId" selectedMonth={selectedMonth} submitLabel="Reverse owner invoice payment" />
        <ReversalForm action={reversePropertyWithdrawalAction} idLabel="Owner distribution reference" idName="withdrawalId" selectedMonth={selectedMonth} submitLabel="Reverse owner distribution" />
      </div>
    </section>
  );
}

function ReversalForm({ action, idLabel, idName, selectedMonth, submitLabel }: { action: (formData: FormData) => Promise<void>; idLabel: string; idName: string; selectedMonth: string; submitLabel: string }) {
  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4">
      <input name="idempotencyKey" type="hidden" value={`owner-reversal-${randomUUID()}`} />
      <h3 className="font-semibold">{submitLabel}</h3>
      <label className="grid gap-1 text-sm">{idLabel}<Input className="h-9" name={idName} required /></label>
      <label className="grid gap-1 text-sm">Reversal date<Input className="h-9" defaultValue={`${selectedMonth}-01`} name="reversalDate" required type="date" /></label>
      <label className="grid gap-1 text-sm">Reason<Input className="h-9" minLength={3} name="reason" required /></label>
      <Button className="h-9 px-3" type="submit" variant="outline">{submitLabel}</Button>
    </form>
  );
}

function TransferAction({ ownerOptions, scopedHiddenFields, selectedMonth, selectedOwnerPersonId }: { ownerOptions: OwnerBalanceData["ownerOptions"]; scopedHiddenFields: ReactNode; selectedMonth: string; selectedOwnerPersonId: string }) {
  return (
    <section aria-labelledby="owner-transfer-heading" className="rounded-2xl border border-border/80 bg-card p-4">
      <h2 className="text-lg font-semibold" id="owner-transfer-heading">Transfer balance between owners</h2>
      <p className="mt-1 text-sm text-muted-foreground">Super Admin only. Creates equal and opposite balance changes and keeps the evidence.</p>
      <form action={transferOwnerBalanceComponentAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {scopedHiddenFields}
        <input name="fromOwnerPersonId" type="hidden" value={selectedOwnerPersonId} />
        <input name="idempotencyKey" type="hidden" value={`owner-transfer-${randomUUID()}`} />
        <label className="grid gap-1 text-sm">To owner<SelectControl ariaLabel="To owner" className="h-9" name="toOwnerPersonId" options={[{ label: "Select owner", value: "" }, ...ownerOptions.filter((item) => item.id !== selectedOwnerPersonId).map((item) => ({ label: item.label, value: item.id }))]} required /></label>
        <label className="grid gap-1 text-sm">Component<SelectControl ariaLabel="Component" className="h-9" name="component" options={OWNER_BALANCE_COMPONENTS.map((component) => ({ label: OWNER_BALANCE_COMPONENT_LABELS[component], value: component }))} required /></label>
        <label className="grid gap-1 text-sm">Amount<Input className="h-9" inputMode="decimal" name="amount" required /></label>
        <label className="grid gap-1 text-sm">Effective date<Input className="h-9" defaultValue={`${selectedMonth}-01`} name="effectiveDate" required type="date" /></label>
        <label className="grid gap-1 text-sm xl:col-span-2">Reason<Input className="h-9" minLength={3} name="reason" required /></label>
        <details className="md:col-span-2 xl:col-span-4">
          <summary className="w-fit cursor-pointer text-sm font-medium">Audit evidence</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">Evidence reference<Input className="h-9" minLength={3} name="evidenceReference" required /></label>
            <label className="grid gap-1 text-sm">Evidence file fingerprint<Input className="h-9 font-mono" minLength={64} name="evidenceSha256" required /></label>
          </div>
        </details>
        <Button className="h-9 px-3 md:col-span-2 xl:col-span-4" type="submit">Transfer balance</Button>
      </form>
    </section>
  );
}

function MoneyAndDateFields({ dateName, selectedMonth }: { dateName: string; selectedMonth: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="grid gap-1 text-sm">Amount<Input className="h-9" inputMode="decimal" name="amount" required /></label>
      <label className="grid gap-1 text-sm">Date<Input className="h-9" defaultValue={`${selectedMonth}-01`} name={dateName} required type="date" /></label>
    </div>
  );
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
  return code ? "Needs review" : "Ready";
}

function auditEntries(
  value: unknown,
  prefix = "",
): Array<{ label: string; value: string }> {
  if (!value || typeof value !== "object") return [];

  return Object.entries(value).flatMap(([key, item]) => {
    const label = [prefix, key]
      .filter(Boolean)
      .join(" ")
      .replaceAll("_", " ")
      .replace(/^./, (character) => character.toUpperCase());

    if (item && typeof item === "object") {
      return auditEntries(item, label);
    }

    return [{ label, value: item === null ? "None" : String(item) }];
  });
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
