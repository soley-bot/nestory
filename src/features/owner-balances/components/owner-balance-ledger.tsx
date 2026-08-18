import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import Link from "next/link";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { AuditDetails } from "@/components/ui/audit-details";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import {
  OwnerAccountOperations,
  OwnerAccountScopeForm,
} from "@/features/owner-balances/components/owner-account-controls";
import { PropertyRecordNavigation } from "@/features/properties/components/property-detail-view";
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

export type PropertyAccountActivityFilter =
  "all" | "rent" | "owner_cash" | "costs" | "deposits" | "corrections";

const PROPERTY_ACCOUNT_PAGE_SIZE = 8;

type OwnerBalanceLedgerProps = {
  canAllocate: boolean;
  canCorrect: boolean;
  canTransfer: boolean;
  closingAuthority?: ReactNode;
  data: OwnerBalanceData;
  openingAuthority?: ReactNode;
  organizationName: string;
  propertyAccount?: {
    activityFilter: PropertyAccountActivityFilter;
    page: number;
    propertyLabel: string;
  };
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
  propertyAccount,
  selectedMonth,
  selectedOwnerPersonId,
  selectedPropertyId,
}: OwnerBalanceLedgerProps) {
  if (propertyAccount && selectedPropertyId) {
    return (
      <PropertyAccountLedger
        data={data}
        activityFilter={propertyAccount.activityFilter}
        page={propertyAccount.page}
        propertyId={selectedPropertyId}
        propertyLabel={propertyAccount.propertyLabel}
        organizationName={organizationName}
        selectedMonth={selectedMonth}
        selectedOwnerPersonId={selectedOwnerPersonId}
      />
    );
  }

  const selectedOwnerOption = data.ownerOptions.find(
    (option) => option.id === selectedOwnerPersonId,
  );
  const hasExactScope = Boolean(
    selectedPropertyId &&
      selectedOwnerPersonId &&
      selectedOwnerOption &&
      (!selectedOwnerOption.propertyIds ||
        selectedOwnerOption.propertyIds.includes(selectedPropertyId)),
  );
  const scopedHiddenFields = hasExactScope ? (
    <>
      <input name="propertyId" type="hidden" value={selectedPropertyId} />
      <input name="ownerPersonId" type="hidden" value={selectedOwnerPersonId} />
      <input name="currency" type="hidden" value="USD" />
    </>
  ) : null;
  const generationAuthority = canAllocate ? (
    <form action={generateOwnerBalancePeriodAction} className="space-y-4">
      {scopedHiddenFields}
      <input
        name="monthStart"
        type="hidden"
        value={`${selectedMonth}-01`}
      />
      <input
        name="idempotencyKey"
        type="hidden"
        value={`owner-period-${randomUUID()}`}
      />
      <p className="text-sm text-muted-foreground">
        Calculate {selectedMonth} from the recorded balance sources.
      </p>
      <div className="flex justify-end">
        <Button type="submit">Generate month</Button>
      </div>
    </form>
  ) : undefined;

  return (
    <main className="workspace-gutter-x mx-auto w-full max-w-[1280px] space-y-4 px-4 pb-12 pt-4 sm:px-6 2xl:px-8">
      <PageHeader
        breadcrumb={
          <PageBreadcrumb
            current="Owner accounts"
            items={[{ href: "/finance", label: "Finance" }]}
          />
        }
        className="border-b border-border pb-3 pt-0"
        title="Owner accounts"
      />

      <OwnerAccountScopeForm
        ownerOptions={data.ownerOptions}
        propertyOptions={data.propertyOptions}
        selectedMonth={selectedMonth}
        selectedOwnerPersonId={selectedOwnerPersonId}
        selectedPropertyId={selectedPropertyId}
      />

      {!hasExactScope ? (
        <section className="border-y border-warning/30 bg-warning-soft px-4 py-3 text-sm">
          <h2 className="font-semibold">Choose a property and owner</h2>
        </section>
      ) : (
        <>
          <OwnerAccountOperations
            closingAuthority={closingAuthority}
            generationAuthority={generationAuthority}
            openingAuthority={openingAuthority}
          />

          <WithdrawalCapacityCard capacity={data.withdrawalCapacity} />

          <section
            aria-labelledby="owner-periods-heading"
            className="space-y-3"
          >
            <h2 className="text-base font-semibold" id="owner-periods-heading">
              Monthly balances
            </h2>
            {data.periods.length === 0 ? (
              <p className="border-y border-border py-5 text-sm text-muted-foreground">
                No monthly balance exists. Approve the opening balances and
                resolve source issues, then calculate the month.
              </p>
            ) : (
              data.periods.map((period) => (
                <article
                  className="overflow-hidden border-y border-border"
                  data-testid={`owner-period-${period.monthStart}`}
                  key={period.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 py-3">
                    <div>
                      <h3 className="font-semibold">
                        {formatMonth(period.monthStart)}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Status:{" "}
                        <span className="font-medium uppercase">
                          {period.status}
                        </span>
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold">
                        Available owner cash:{" "}
                        {period.availableWithdrawal === null
                          ? "Unavailable"
                          : formatExactMoney(period.availableWithdrawal)}
                      </p>
                    </div>
                  </div>
                  {period.components.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[42rem] text-left text-sm">
                        <thead className="bg-[var(--table-header-bg)] text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="py-2 pr-4" scope="col">
                              Component
                            </th>
                            <th className="px-4 py-2 text-right" scope="col">
                              Opening
                            </th>
                            <th className="px-4 py-2 text-right" scope="col">
                              Movement
                            </th>
                            <th className="px-4 py-2 text-right" scope="col">
                              Closing
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {period.components.map((component) => (
                            <tr key={component.component}>
                              <th
                                className="py-2.5 pr-4 font-medium"
                                scope="row"
                              >
                                {
                                  OWNER_BALANCE_COMPONENT_LABELS[
                                    component.component
                                  ]
                                }
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
                  ) : (
                    <div className="bg-amber-50/70 px-4 py-4 text-sm text-amber-950">
                      <p className="font-semibold">
                        {remediationLabel(period.blockedReasonCode)}
                      </p>
                      <AuditDetails
                        className="mt-2"
                        entries={[
                          {
                            label: "Reason code",
                            value: period.blockedReasonCode,
                          },
                          ...auditEntries(period.blockedReasonDetail),
                        ]}
                        label="Technical details"
                      />
                    </div>
                  )}
                  <AuditDetails
                    className="border-t border-border/60 py-2"
                    entries={[
                      {
                        label: "Input watermark",
                        value: period.inputWatermark,
                      },
                      { label: "Input hash", value: period.inputHash },
                    ]}
                  />
                </article>
              ))
            )}
          </section>

          <details className="border-y border-border">
            <summary className="flex cursor-pointer items-center justify-between py-3 font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <span id="owner-remediation-heading">Source issues</span>
              <span className="text-sm font-normal text-muted-foreground">
                {data.queue.length}
              </span>
            </summary>
            {data.queue.length === 0 ? (
              <p className="border-t border-border py-4 text-sm text-muted-foreground">
                No source issues in this month.
              </p>
            ) : (
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full min-w-[56rem] text-left text-sm">
                  <thead className="bg-[var(--table-header-bg)] text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2" scope="col">
                        Event
                      </th>
                      <th className="px-4 py-2" scope="col">
                        Source
                      </th>
                      <th className="px-4 py-2 text-right" scope="col">
                        Amount
                      </th>
                      <th className="px-4 py-2" scope="col">
                        Status
                      </th>
                      <th className="px-4 py-2" scope="col">
                        Action
                      </th>
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
          </details>

          <details className="border-y border-border">
            <summary className="flex cursor-pointer items-center justify-between py-3 font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <span id="owner-sources-heading">Balance sources</span>
              <span className="text-sm font-normal text-muted-foreground">
                {data.sources.length}
              </span>
            </summary>
            <div className="divide-y divide-border border-t border-border">
              {data.sources.map((source) => (
                <details
                  data-testid={`owner-source-${source.allocationSetId}`}
                  key={source.allocationSetId}
                >
                  <summary className="cursor-pointer list-none px-4 py-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-semibold">
                        {sourceTypeLabel(source.sourceType)}
                      </span>
                      <span className="tabular-nums">
                        {source.eventDate} ·{" "}
                        {formatExactMoney(source.allocatedGrossSignedAmount)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ownership at event {source.ownershipPercentSnapshot}% ·{" "}
                      {source.allocationBasis.replaceAll("_", " ")}
                    </p>
                  </summary>
                  <div className="space-y-2 border-t border-border/60 px-4 py-3 text-xs">
                    {source.reversalOfAllocationSetId ? (
                      <p className="font-medium text-warning">
                        Reverses an earlier balance assignment.
                      </p>
                    ) : null}
                    <ul className="space-y-1">
                      {source.movements.length === 0 ? (
                        <li className="text-muted-foreground">
                          Activity only — no owner component movement.
                        </li>
                      ) : (
                        source.movements.map((movement) => (
                          <li
                            className="flex flex-wrap justify-between gap-2"
                            key={movement.id}
                          >
                            <span>
                              {
                                OWNER_BALANCE_COMPONENT_LABELS[
                                  movement.component
                                ]
                              }{" "}
                              {formatSignedExactMoney(movement.signedAmount)}
                            </span>
                            {movement.reversalOfMovementId ? (
                              <span>Reversal</span>
                            ) : null}
                          </li>
                        ))
                      )}
                    </ul>
                    <AuditDetails
                      entries={[
                        { label: "Source type", value: source.sourceType },
                        { label: "Source line", value: source.sourceLineId },
                        {
                          label: "Source fingerprint",
                          value: source.sourceFingerprint,
                        },
                        {
                          label: "Ownership hash",
                          value: source.ownershipRosterHash,
                        },
                        {
                          label: "Reversed assignment",
                          value: source.reversalOfAllocationSetId,
                        },
                      ]}
                    />
                  </div>
                </details>
              ))}
            </div>
          </details>

          {canCorrect || canTransfer ? (
            <details className="border-y border-border">
              <summary className="cursor-pointer py-3 font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                Balance operations
              </summary>
              <div className="space-y-4 border-t border-border py-4">
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
              </div>
            </details>
          ) : null}
        </>
      )}
    </main>
  );
}

function PropertyAccountLedger({
  activityFilter,
  data,
  organizationName,
  page,
  propertyId,
  propertyLabel,
  selectedMonth,
  selectedOwnerPersonId,
}: {
  activityFilter: PropertyAccountActivityFilter;
  data: OwnerBalanceData;
  organizationName: string;
  page: number;
  propertyId: string;
  propertyLabel: string;
  selectedMonth: string;
  selectedOwnerPersonId?: string;
}) {
  const hasExactScope = Boolean(selectedOwnerPersonId);
  const selectedPeriod = data.periods.find(
    (period) => period.monthStart === `${selectedMonth}-01`,
  );
  const ownerDirectTotal = sumExactMoney(
    data.sources
      .filter(
        (source) =>
          source.sourceType === "owner_direct_rent_receipt" ||
          (source.sourceType === "reversal" && source.movements.length === 0),
      )
      .map((source) => source.allocatedGrossSignedAmount),
  );
  const ownerDueToNestory =
    selectedPeriod?.components.find(
      (component) => component.component === "owner_due_to_ips",
    )?.closingAmount ?? "0.00";
  const nestoryDueToOwner =
    selectedPeriod?.components.find(
      (component) => component.component === "ips_due_to_owner",
    )?.closingAmount ?? "0.00";
  const unresolvedSourceCount = data.queue.filter(
    (source) => source.allocationState !== "allocated",
  ).length;
  const filteredSources = [...data.sources]
    .filter((source) =>
      propertyAccountSourceMatchesFilter(source, activityFilter),
    )
    .sort((left, right) => right.eventDate.localeCompare(left.eventDate));
  const totalPages = Math.max(
    1,
    Math.ceil(filteredSources.length / PROPERTY_ACCOUNT_PAGE_SIZE),
  );
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const pageStart = (currentPage - 1) * PROPERTY_ACCOUNT_PAGE_SIZE;
  const pagedSources = filteredSources.slice(
    pageStart,
    pageStart + PROPERTY_ACCOUNT_PAGE_SIZE,
  );
  const fullBalanceParams = new URLSearchParams({
    month: selectedMonth,
    propertyId,
  });
  if (selectedOwnerPersonId) {
    fullBalanceParams.set("ownerPersonId", selectedOwnerPersonId);
  }
  const activityParams = new URLSearchParams({
    activity: activityFilter,
    month: selectedMonth,
  });
  if (selectedOwnerPersonId) {
    activityParams.set("ownerPersonId", selectedOwnerPersonId);
  }
  const activityPageHref = (nextPage: number) => {
    const params = new URLSearchParams(activityParams);
    params.set("page", String(nextPage));
    return `/properties/${propertyId}/account?${params.toString()}`;
  };

  return (
    <main className="min-w-0 pb-12">
      <PageHeader
        actions={
          <Link
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted"
            href={`/balances?${fullBalanceParams.toString()}`}
            prefetch={false}
          >
            Balance operations
          </Link>
        }
        breadcrumb={
          <PageBreadcrumb
            current="Owner account"
            items={[
              { href: "/properties", label: "Properties" },
              { href: `/properties/${propertyId}`, label: propertyLabel },
            ]}
          />
        }
        className="px-4 sm:px-6 2xl:px-8"
        description={propertyLabel}
        title="Property account"
      />

      <div
        className="workspace-gutter-x space-y-4 px-4 sm:px-6 2xl:px-8"
        data-slot="property-account-workspace"
      >
        <PropertyRecordNavigation
          activeSection="account"
          accountHref={`/properties/${propertyId}/account`}
          propertyId={propertyId}
        />

        <form
          className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-end"
          method="get"
        >
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium sm:max-w-sm">
            Owner
            <SelectControl
              ariaLabel="Owner"
              className="h-9"
              defaultValue={selectedOwnerPersonId ?? ""}
              name="ownerPersonId"
              options={[
                { label: "Select owner", value: "" },
                ...data.ownerOptions.map((option) => ({
                  label: option.label,
                  value: option.id,
                })),
              ]}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Month
            <Input
              className="h-9 sm:w-44"
              defaultValue={selectedMonth}
              name="month"
              type="month"
            />
          </label>
          <Button className="h-9 px-4" type="submit" variant="outline">
            Apply
          </Button>
        </form>

        {!hasExactScope ? (
          <section className="border-y border-border py-10 text-sm">
            <h2 className="font-semibold">Select an owner</h2>
            <p className="mt-1 text-muted-foreground">
              Choose an owner assignment to view this property account.
            </p>
          </section>
        ) : (
          <>
            <section
              aria-label="Owner cash position"
              className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0"
              role="region"
            >
              <PropertyAccountMetric
                label={`Cash collected by ${organizationName}`}
                value={
                  data.withdrawalCapacity
                    ? formatExactMoney(
                        data.withdrawalCapacity.authoritativeHeldCash,
                      )
                    : "Unavailable"
                }
              />
              <PropertyAccountMetric
                label="Available to distribute"
                tone="success"
                value={
                  data.withdrawalCapacity?.status === "available" &&
                  data.withdrawalCapacity.availableWithdrawal !== null
                    ? formatExactMoney(
                        data.withdrawalCapacity.availableWithdrawal,
                      )
                    : "Unavailable"
                }
              />
              <PropertyAccountMetric
                label="Cash collected by owner"
                value={formatExactMoney(ownerDirectTotal)}
              />
            </section>

            <section aria-label="Owner account activity" role="region">
              <div className="flex flex-col gap-3 border-b border-border pb-3 lg:flex-row lg:items-end">
                <div>
                  <h2 className="text-base font-semibold">Account activity</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {unresolvedSourceCount > 0
                      ? `${unresolvedSourceCount} source issue${unresolvedSourceCount === 1 ? "" : "s"}`
                      : "All recorded sources assigned"}
                  </p>
                </div>
                <div className="ml-auto flex flex-col gap-3 sm:flex-row sm:items-end">
                  {ownerDueToNestory !== "0.00" ||
                  nestoryDueToOwner !== "0.00" ? (
                    <dl className="flex flex-wrap gap-x-5 gap-y-1 pb-1 text-sm">
                      {ownerDueToNestory !== "0.00" ? (
                        <PropertyAccountObligation
                          label={`Owner owes ${organizationName}`}
                          tone="danger"
                          value={ownerDueToNestory}
                        />
                      ) : null}
                      {nestoryDueToOwner !== "0.00" ? (
                        <PropertyAccountObligation
                          label="Owner reimbursement due"
                          tone="warning"
                          value={nestoryDueToOwner}
                        />
                      ) : null}
                    </dl>
                  ) : null}
                  <form className="flex items-end gap-2" method="get">
                    <input name="month" type="hidden" value={selectedMonth} />
                    {selectedOwnerPersonId ? (
                      <input
                        name="ownerPersonId"
                        type="hidden"
                        value={selectedOwnerPersonId}
                      />
                    ) : null}
                    <div className="min-w-44">
                      <SelectControl
                        ariaLabel="Activity filter"
                        className="h-8"
                        defaultValue={activityFilter}
                        name="activity"
                        options={[
                          { label: "All activity", value: "all" },
                          { label: "Rent", value: "rent" },
                          { label: "Owner cash", value: "owner_cash" },
                          { label: "Costs", value: "costs" },
                          { label: "Deposits", value: "deposits" },
                          { label: "Corrections", value: "corrections" },
                        ]}
                      />
                    </div>
                    <Button
                      className="h-8 px-3"
                      type="submit"
                      variant="outline"
                    >
                      Filter
                    </Button>
                  </form>
                </div>
              </div>
              {filteredSources.length === 0 ? (
                <p className="py-8 text-sm text-muted-foreground">
                  No matching account activity for this month.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[44rem] text-left text-sm">
                      <thead className="bg-[var(--table-header-bg)] text-xs font-medium text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2" scope="col">
                            Date
                          </th>
                          <th className="px-3 py-2" scope="col">
                            Activity
                          </th>
                          <th className="px-3 py-2" scope="col">
                            Details
                          </th>
                          <th className="px-3 py-2 text-right" scope="col">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {pagedSources.map((source) => (
                          <tr
                            className="transition-colors hover:bg-muted/35"
                            key={source.allocationSetId}
                          >
                            <td className="px-3 py-2 text-muted-foreground">
                              {source.eventDate}
                            </td>
                            <td className="px-3 py-2 font-medium">
                              {propertyAccountSourceLabel(source.sourceType)}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {propertyAccountImpactLabel(source)}
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-semibold tabular-nums ${propertyAccountAmountTone(source)}`}
                            >
                              {formatSignedExactMoney(
                                source.allocatedGrossSignedAmount,
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <nav
                    aria-label="Account activity pagination"
                    className="flex items-center justify-between border-t border-border pt-3 text-sm"
                  >
                    <p className="text-xs text-muted-foreground">
                      {pageStart + 1}
                      {"\u2013"}
                      {Math.min(
                        pageStart + PROPERTY_ACCOUNT_PAGE_SIZE,
                        filteredSources.length,
                      )}{" "}
                      of {filteredSources.length}
                    </p>
                    <div className="flex items-center gap-2">
                      {currentPage > 1 ? (
                        <Link
                          className="inline-flex h-8 items-center rounded-md border border-border px-3 font-medium hover:bg-muted"
                          href={activityPageHref(currentPage - 1)}
                          prefetch={false}
                        >
                          Previous
                        </Link>
                      ) : (
                        <span className="inline-flex h-8 items-center rounded-md border border-border px-3 text-muted-foreground opacity-50">
                          Previous
                        </span>
                      )}
                      {currentPage < totalPages ? (
                        <Link
                          className="inline-flex h-8 items-center rounded-md border border-border px-3 font-medium hover:bg-muted"
                          href={activityPageHref(currentPage + 1)}
                          prefetch={false}
                        >
                          Next
                        </Link>
                      ) : (
                        <span className="inline-flex h-8 items-center rounded-md border border-border px-3 text-muted-foreground opacity-50">
                          Next
                        </span>
                      )}
                    </div>
                  </nav>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function PropertyAccountMetric({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "success";
  value: string;
}) {
  return (
    <div className="min-w-0 py-2.5 sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <p
        className={`text-xl font-semibold tabular-nums tracking-tight ${tone === "success" ? "text-success" : "text-foreground"}`}
      >
        {value}
      </p>
      <h2 className="mt-0.5 text-xs font-medium text-muted-foreground">
        {label}
      </h2>
    </div>
  );
}

function PropertyAccountObligation({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "danger" | "warning";
  value: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`font-semibold tabular-nums ${tone === "danger" ? "text-destructive" : "text-warning"}`}
      >
        {formatExactMoney(value)}
      </dd>
    </div>
  );
}

function propertyAccountSourceLabel(sourceType: string) {
  if (sourceType === "tenant_rent_receipt") return "Rent collected by Nestory";
  if (sourceType === "owner_direct_rent_receipt")
    return "Rent collected by owner";
  if (sourceType === "management_fee_occurrence") return "Management fee";
  if (sourceType === "owner_paid_cost") return "Owner cost";
  if (sourceType === "owner_distribution") return "Owner distribution";
  if (sourceType === "owner_contribution") return "Owner contribution";
  if (sourceType === "reversal") return "Correction";
  return sourceTypeLabel(sourceType);
}

function propertyAccountImpactLabel(
  source: OwnerBalanceData["sources"][number],
) {
  if (source.sourceType === "owner_direct_rent_receipt")
    return "Collected by owner";
  if (source.sourceType === "reversal" && source.movements.length === 0) {
    return "Owner collection correction";
  }
  const component = source.movements[0]?.component;
  const amount = source.movements[0]?.signedAmount;
  if (component === "ips_held_owner_cash") {
    return amount?.startsWith("-") ? "Paid from Nestory" : "Held by Nestory";
  }
  if (component === "owner_due_to_ips") {
    return amount?.startsWith("-") ? "Paid by owner" : "Owner owes Nestory";
  }
  if (component === "ips_due_to_owner") return "Nestory owes owner";
  if (component === "security_deposit_custody") return "Deposit custody";
  return "Recorded activity";
}

function propertyAccountAmountTone(
  source: OwnerBalanceData["sources"][number],
) {
  if (source.sourceType === "owner_direct_rent_receipt")
    return "text-foreground";
  const movement = source.movements[0];
  if (movement?.component === "ips_held_owner_cash") {
    return movement.signedAmount.startsWith("-")
      ? "text-destructive"
      : "text-success";
  }
  if (
    movement?.component === "owner_due_to_ips" &&
    !movement.signedAmount.startsWith("-")
  ) {
    return "text-destructive";
  }
  return source.allocatedGrossSignedAmount.startsWith("-")
    ? "text-destructive"
    : "text-foreground";
}

function propertyAccountSourceMatchesFilter(
  source: OwnerBalanceData["sources"][number],
  filter: PropertyAccountActivityFilter,
) {
  if (filter === "all") return true;
  if (filter === "rent") {
    return (
      source.sourceType === "tenant_rent_receipt" ||
      source.sourceType === "owner_direct_rent_receipt"
    );
  }
  if (filter === "owner_cash") {
    return [
      "owner_contribution",
      "owner_distribution",
      "owner_invoice_payment",
      "owner_reimbursement",
    ].includes(source.sourceType);
  }
  if (filter === "costs") {
    return (
      source.sourceType === "management_fee_occurrence" ||
      source.sourceType === "owner_paid_cost"
    );
  }
  if (filter === "deposits")
    return source.sourceType.startsWith("security_deposit_");
  return source.sourceType === "reversal";
}

function sumExactMoney(values: readonly string[]) {
  const cents = values.reduce(
    (total, value) => total + exactMoneyCents(value),
    BigInt(0),
  );
  const negative = cents < BigInt(0);
  const unsigned = negative ? -cents : cents;
  const whole = unsigned / BigInt(100);
  const fraction = (unsigned % BigInt(100)).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function exactMoneyCents(value: string) {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = "00"] = unsigned.split(".");
  const cents =
    BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  return negative ? -cents : cents;
}

function WithdrawalCapacityCard({
  capacity,
}: {
  capacity: OwnerBalanceData["withdrawalCapacity"];
}) {
  const available =
    capacity?.status === "available" && capacity.availableWithdrawal !== null;

  return (
    <section
      className="border-b border-border py-4"
      data-testid="owner-withdrawal-capacity"
    >
      <h2 className="text-sm font-medium text-muted-foreground">
        {available
          ? "Available to distribute"
          : "Distribution amount unavailable"}
      </h2>
      {available ? (
        <>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatExactMoney(capacity.availableWithdrawal!)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            As of {capacity.asOfDate} · Committed or reserved:{" "}
            {formatExactMoney(capacity.committedReserved)}
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

function RemediationRow({
  canAllocate,
  item,
}: {
  canAllocate: boolean;
  item: OwnerEventAllocationQueueRecord;
}) {
  const setupPath = remediationSetupPath(item.remediationDetail);
  return (
    <tr data-testid={`owner-remediation-${item.sourceLineId}`}>
      <td className="px-4 py-3">{item.eventDate}</td>
      <td className="px-4 py-3">
        <p className="font-medium">{sourceTypeLabel(item.sourceType)}</p>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {formatExactMoney(item.grossSignedAmount)}
      </td>
      <td className="px-4 py-3">
        <p className="font-semibold">
          {remediationLabel(item.remediationCode)}
        </p>
        <AuditDetails
          className="mt-1"
          entries={[
            { label: "Source line", value: item.sourceLineId },
            {
              label: "Reason code",
              value: item.remediationCode ?? item.allocationState,
            },
            ...auditEntries(item.remediationDetail),
          ]}
          label="Technical details"
        />
      </td>
      <td className="px-4 py-3">
        {setupPath ? (
          <Link
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
            href={setupPath}
          >
            Resolve ownership
          </Link>
        ) : null}
        {canAllocate && item.allocationState !== "allocated" ? (
          <form action={allocateOwnerEventAction} className="mt-2">
            <input name="sourceType" type="hidden" value={item.sourceType} />
            <input
              name="sourceLineId"
              type="hidden"
              value={item.sourceLineId}
            />
            <input
              name="idempotencyKey"
              type="hidden"
              value={`owner-allocate-${randomUUID()}`}
            />
            <Button size="sm" type="submit" variant="outline">
              Assign to owner balance
            </Button>
          </form>
        ) : null}
      </td>
    </tr>
  );
}

function OwnerCashActions({
  scopedHiddenFields,
  selectedMonth,
}: {
  scopedHiddenFields: ReactNode;
  selectedMonth: string;
}) {
  return (
    <section aria-labelledby="owner-cash-actions-heading" className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold" id="owner-cash-actions-heading">
          Owner cash activity
        </h2>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        {(["owner_contribution", "owner_reimbursement"] as const).map(
          (eventType) => (
            <form
              action={recordOwnerCashEventAction}
              className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4"
              key={eventType}
            >
              {scopedHiddenFields}
              <input name="eventType" type="hidden" value={eventType} />
              <input
                name="idempotencyKey"
                type="hidden"
                value={`owner-cash-${randomUUID()}`}
              />
              <h3 className="font-semibold">
                {eventType === "owner_contribution"
                  ? "Owner contribution"
                  : "Owner reimbursement"}
              </h3>
              <MoneyAndDateFields
                dateName="eventDate"
                selectedMonth={selectedMonth}
              />
              <label className="grid gap-1 text-sm">
                Reason
                <Input className="h-9" minLength={3} name="reason" required />
              </label>
              <Button className="h-9 px-3" type="submit">
                {eventType === "owner_contribution"
                  ? "Record owner contribution"
                  : "Record owner reimbursement"}
              </Button>
            </form>
          ),
        )}
        <form
          action={recordOwnerDistributionAction}
          className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4"
        >
          {scopedHiddenFields}
          <input
            name="idempotencyKey"
            type="hidden"
            value={`owner-distribution-${randomUUID()}`}
          />
          <h3 className="font-semibold">Owner distribution</h3>
          <MoneyAndDateFields
            dateName="distributionDate"
            selectedMonth={selectedMonth}
          />
          <label className="grid gap-1 text-sm">
            Reference
            <Input className="h-9" name="reference" required />
          </label>
          <Button className="h-9 px-3" type="submit">
            Record owner distribution
          </Button>
        </form>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <ReversalForm
          action={reverseOwnerInvoicePaymentAction}
          idLabel="Owner invoice payment reference"
          idName="ownerPaymentId"
          selectedMonth={selectedMonth}
          submitLabel="Reverse owner invoice payment"
        />
        <ReversalForm
          action={reversePropertyWithdrawalAction}
          idLabel="Owner distribution reference"
          idName="withdrawalId"
          selectedMonth={selectedMonth}
          submitLabel="Reverse owner distribution"
        />
      </div>
    </section>
  );
}

function ReversalForm({
  action,
  idLabel,
  idName,
  selectedMonth,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  idLabel: string;
  idName: string;
  selectedMonth: string;
  submitLabel: string;
}) {
  return (
    <form
      action={action}
      className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4"
    >
      <input
        name="idempotencyKey"
        type="hidden"
        value={`owner-reversal-${randomUUID()}`}
      />
      <h3 className="font-semibold">{submitLabel}</h3>
      <label className="grid gap-1 text-sm">
        {idLabel}
        <Input className="h-9" name={idName} required />
      </label>
      <label className="grid gap-1 text-sm">
        Reversal date
        <Input
          className="h-9"
          defaultValue={`${selectedMonth}-01`}
          name="reversalDate"
          required
          type="date"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Reason
        <Input className="h-9" minLength={3} name="reason" required />
      </label>
      <Button className="h-9 px-3" type="submit" variant="outline">
        {submitLabel}
      </Button>
    </form>
  );
}

function TransferAction({
  ownerOptions,
  scopedHiddenFields,
  selectedMonth,
  selectedOwnerPersonId,
}: {
  ownerOptions: OwnerBalanceData["ownerOptions"];
  scopedHiddenFields: ReactNode;
  selectedMonth: string;
  selectedOwnerPersonId: string;
}) {
  return (
    <section
      aria-labelledby="owner-transfer-heading"
      className="rounded-2xl border border-border/80 bg-card p-4"
    >
      <h2 className="text-lg font-semibold" id="owner-transfer-heading">
        Transfer balance between owners
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Super Admin only. Creates equal and opposite balance changes and keeps
        the evidence.
      </p>
      <form
        action={transferOwnerBalanceComponentAction}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        {scopedHiddenFields}
        <input
          name="fromOwnerPersonId"
          type="hidden"
          value={selectedOwnerPersonId}
        />
        <input
          name="idempotencyKey"
          type="hidden"
          value={`owner-transfer-${randomUUID()}`}
        />
        <label className="grid gap-1 text-sm">
          To owner
          <SelectControl
            ariaLabel="To owner"
            className="h-9"
            name="toOwnerPersonId"
            options={[
              { label: "Select owner", value: "" },
              ...ownerOptions
                .filter((item) => item.id !== selectedOwnerPersonId)
                .map((item) => ({ label: item.label, value: item.id })),
            ]}
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          Component
          <SelectControl
            ariaLabel="Component"
            className="h-9"
            name="component"
            options={OWNER_BALANCE_COMPONENTS.map((component) => ({
              label: OWNER_BALANCE_COMPONENT_LABELS[component],
              value: component,
            }))}
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          Amount
          <Input className="h-9" inputMode="decimal" name="amount" required />
        </label>
        <label className="grid gap-1 text-sm">
          Effective date
          <Input
            className="h-9"
            defaultValue={`${selectedMonth}-01`}
            name="effectiveDate"
            required
            type="date"
          />
        </label>
        <label className="grid gap-1 text-sm xl:col-span-2">
          Reason
          <Input className="h-9" minLength={3} name="reason" required />
        </label>
        <details className="md:col-span-2 xl:col-span-4">
          <summary className="w-fit cursor-pointer text-sm font-medium">
            Audit evidence
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Evidence reference
              <Input
                className="h-9"
                minLength={3}
                name="evidenceReference"
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              Evidence file fingerprint
              <Input
                className="h-9 font-mono"
                minLength={64}
                name="evidenceSha256"
                required
              />
            </label>
          </div>
        </details>
        <Button className="h-9 px-3 md:col-span-2 xl:col-span-4" type="submit">
          Transfer balance
        </Button>
      </form>
    </section>
  );
}

function MoneyAndDateFields({
  dateName,
  selectedMonth,
}: {
  dateName: string;
  selectedMonth: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="grid gap-1 text-sm">
        Amount
        <Input className="h-9" inputMode="decimal" name="amount" required />
      </label>
      <label className="grid gap-1 text-sm">
        Date
        <Input
          className="h-9"
          defaultValue={`${selectedMonth}-01`}
          name={dateName}
          required
          type="date"
        />
      </label>
    </div>
  );
}

function remediationSetupPath(value: unknown) {
  if (!value || typeof value !== "object" || !("setup_path" in value))
    return null;
  const setupPath = (value as { setup_path?: unknown }).setup_path;
  return typeof setupPath === "string" && setupPath.startsWith("/properties/")
    ? setupPath
    : null;
}

function remediationLabel(code: string | null) {
  if (
    code?.startsWith("owner_roster_") ||
    code === "ambiguous_event_ownership"
  ) {
    return "Ownership needs resolution";
  }
  if (code === "source_fingerprint_drift")
    return "Source changed after allocation";
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
  return value.startsWith("-")
    ? formatExactMoney(value)
    : `+${formatExactMoney(value)}`;
}

function formatExactMoney(value: string) {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}USD ${grouped}.${fraction}`;
}
