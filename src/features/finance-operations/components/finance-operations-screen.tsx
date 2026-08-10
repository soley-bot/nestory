"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Plus,
  WalletCards,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox as CheckboxPrimitive } from "@/components/ui/checkbox";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { NumberInput } from "@/components/ui/number-input";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceWorkspaceNavigation } from "@/features/finance/components/finance-workspace-navigation";
import {
  confirmOwnerCollectionAction,
  recordOwnerPaymentAction,
  recordTenantInvoicePaymentAction,
  recordWithdrawalAction,
  recoverLeaseRentPeriodAction,
  recoverRentGenerationExceptionAction,
  reverseExpenseAction,
  reverseOwnerCollectionConfirmationAction,
  reverseTenantInvoicePaymentAction,
  reviewExpenseAction,
  saveLeaseBillingAction,
  submitExpenseAction,
} from "@/features/finance-operations/actions";
import type {
  ExpenseSubmissionSummary,
  FinanceLease,
  FinanceOperationsActionState,
  FinanceOperationsData,
  OwnerInvoiceSummary,
  PropertyFinancePosition,
  RentGenerationException,
  TenantInvoiceSettlement,
  TenantInvoiceSummary,
} from "@/features/finance-operations/finance-operations.types";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";
import { cn } from "@/lib/utils";

export type FinanceOperationsView =
  "account" | "balances" | "expenses" | "rent" | "work";

type ModalState =
  | {
      canChooseAnother?: boolean;
      invoice?: TenantInvoiceSummary;
      mode: "payment";
    }
  | { invoice: OwnerInvoiceSummary; mode: "owner-payment" }
  | {
      decision: "approve" | "reject";
      mode: "expense-review";
      submission: ExpenseSubmissionSummary;
    }
  | {
      mode: "expense-reversal";
      submission: ExpenseSubmissionSummary;
    }
  | {
      invoice: TenantInvoiceSummary;
      mode: "settlement-reversal";
    }
  | { mode: "withdrawal"; position: PropertyFinancePosition };

type DrawerState =
  | { lease: FinanceLease; mode: "billing" }
  | { mode: "rent-recovery" }
  | {
      initialInvoiceId?: string;
      initialResponsibility?: "owner" | "tenant";
      mode: "expense";
    };

type FinanceOperationsScreenProps = FinanceOperationsData & {
  canConfigureRent: boolean;
  canCorrectFinance: boolean;
  canRecordOwnerCash: boolean;
  canRecordPayments: boolean;
  canReadFinanceReports?: boolean;
  canRecoverRent: boolean;
  canReviewExpense: boolean;
  canReverseExpense: boolean;
  canRetryCurrentRent: boolean;
  canSubmitExpense: boolean;
  openingAuthority?: ReactNode;
  organizationName: string;
  selectedPropertyId?: string | null;
  view: FinanceOperationsView;
};

const actionInitialState: FinanceOperationsActionState = {};
const leaseMonthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

export function FinanceOperationsScreen(props: FinanceOperationsScreenProps) {
  const organizationName = props.organizationName.trim() || "our company";
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const closeDrawer = () => setDrawer(null);
  const closeModal = () => setModal(null);
  const openDrawer = (next: DrawerState) => {
    setStatusMessage(null);
    setModal(null);
    setDrawer(next);
  };
  const openModal = (next: ModalState) => {
    setStatusMessage(null);
    setDrawer(null);
    setModal(next);
  };
  const onActionSuccess = (message: string) => {
    setStatusMessage(message);
    closeDrawer();
    closeModal();
  };
  const screen = getScreen(
    { ...props, organizationName },
    openModal,
    openDrawer,
  );
  const visibleDrawer =
    drawer &&
    (drawer.mode === "billing"
      ? props.canConfigureRent
      : drawer.mode === "rent-recovery"
        ? props.canRecoverRent
        : props.canSubmitExpense)
      ? drawer
      : null;
  const visibleModal =
    modal && canRenderFinanceModal(modal, props) ? modal : null;

  return (
    <WorkspacePage
      actions={screen.actions}
      context={screen.context}
      contextHref={screen.contextHref}
      headerClassName="py-3 lg:py-3"
      localNav={(
        <FinanceWorkspaceNavigation
          activeRoute={screen.activeRoute}
          canReadFinanceReports={props.canReadFinanceReports ?? false}
        />
      )}
      title={screen.title}
      toolbar={screen.toolbar}
    >
      <div className="flex h-full min-h-0 flex-col">
        {statusMessage ? (
          <div className="shrink-0 border-b border-border bg-card px-4 py-2 sm:px-6">
            <p className="text-sm" role="status">
              {statusMessage}
            </p>
          </div>
        ) : null}
        {screen.body}
      </div>

      {visibleDrawer ? (
        <SideDrawer onClose={closeDrawer} open title={getDrawerTitle(visibleDrawer)}>
          {visibleDrawer.mode === "billing" ? (
            <BillingSetupForm
              lease={visibleDrawer.lease}
              onSuccess={onActionSuccess}
              organizationName={organizationName}
              peopleOptions={props.peopleOptions}
            />
          ) : visibleDrawer.mode === "rent-recovery" ? (
            <HistoricalRentRecoveryForm
              leases={props.leases}
              onSuccess={onActionSuccess}
            />
          ) : (
            <ExpenseForm
              initialInvoiceId={visibleDrawer.initialInvoiceId}
              initialResponsibility={visibleDrawer.initialResponsibility}
              invoices={props.tenantInvoices}
              onSuccess={onActionSuccess}
              propertyOptions={props.propertyOptions}
              reconciliationSources={props.reconciliationSources}
              unitOptions={props.unitOptions}
            />
          )}
        </SideDrawer>
      ) : null}

      {visibleModal ? (
        <Modal onClose={closeModal} open title={getModalTitle(visibleModal)}>
          {visibleModal.mode === "payment" ? (
            visibleModal.invoice ? (
              <SettleInvoiceForm
                invoice={visibleModal.invoice}
                onChooseAnother={
                  visibleModal.canChooseAnother
                    ? () => setModal({ mode: "payment" })
                    : undefined
                }
                onSuccess={onActionSuccess}
                reconciliationSources={props.reconciliationSources}
              />
            ) : (
              <PaymentChooser
                invoices={props.tenantInvoices.filter(
                  (invoice) => invoice.balanceDue > 0,
                )}
                onChoose={(invoice) =>
                  setModal({ canChooseAnother: true, invoice, mode: "payment" })
                }
              />
            )
          ) : visibleModal.mode === "owner-payment" ? (
            <OwnerPaymentForm
              invoice={visibleModal.invoice}
              onSuccess={onActionSuccess}
            />
          ) : visibleModal.mode === "expense-review" ? (
            <ExpenseReviewForm
              decision={visibleModal.decision}
              onSuccess={onActionSuccess}
              reconciliationSources={props.reconciliationSources}
              submission={visibleModal.submission}
            />
          ) : visibleModal.mode === "expense-reversal" ? (
            <ExpenseReversalForm
              onSuccess={onActionSuccess}
              submission={visibleModal.submission}
            />
          ) : visibleModal.mode === "settlement-reversal" ? (
            <SettlementReversalForm
              invoice={visibleModal.invoice}
              onSuccess={onActionSuccess}
            />
          ) : (
            <WithdrawalForm
              onSuccess={onActionSuccess}
              position={visibleModal.position}
            />
          )}
        </Modal>
      ) : null}
    </WorkspacePage>
  );
}

function getScreen(
  props: FinanceOperationsScreenProps,
  openModal: (modal: ModalState) => void,
  openDrawer: (drawer: DrawerState) => void,
) {
  const canConfigureRent = props.canConfigureRent;
  const canRecoverRent = props.canRecoverRent;

  if (props.view === "rent") {
    return {
      activeRoute: "/rent-income" as const,
      actions:
        props.canRecordPayments || props.canSubmitExpense || canRecoverRent ? (
        <>
          {canRecoverRent ? (
            <Button onClick={() => openDrawer({ mode: "rent-recovery" })}>
              Recover missed month
            </Button>
          ) : null}
          {props.canRecordPayments ? (
            <Button
              onClick={() => openModal({ mode: "payment" })}
              variant="default"
            >
              <WalletCards size={15} /> Record payment
            </Button>
          ) : null}
          {props.canSubmitExpense ? (
            <Button
              onClick={() =>
                openDrawer({ initialResponsibility: "tenant", mode: "expense" })
              }
            >
              <Plus size={15} /> Add charge
            </Button>
          ) : null}
        </>
        ) : undefined,
      body: (
        <RentView
          canCorrectFinance={props.canCorrectFinance}
          canRecordPayments={props.canRecordPayments}
          invoices={props.tenantInvoices}
          openModal={openModal}
          organizationName={props.organizationName}
        />
      ),
      context: `${props.tenantInvoices.length} invoices`,
      contextHref: "/rent-income",
      title: "Rent",
      toolbar: undefined,
    };
  }

  if (props.view === "expenses") {
    return {
      activeRoute: "/bills-expenses" as const,
      actions: props.canSubmitExpense ? (
        <Button
          onClick={() => openDrawer({ mode: "expense" })}
          variant="default"
        >
          <Plus size={15} /> Add expense
        </Button>
      ) : undefined,
      body: (
        <ExpensesView
          canReview={props.canReviewExpense}
          canReverse={props.canReverseExpense}
          openModal={openModal}
          submissions={props.expenseSubmissions}
        />
      ),
      context: `${props.expenseSubmissions.length} submissions`,
      contextHref: "/bills-expenses",
      title: "Expenses",
      toolbar: undefined,
    };
  }

  if (props.view === "balances") {
    return {
      activeRoute: "/balances" as const,
      actions: undefined,
      body: (
        <BalancesView
          canRecordOwnerCash={props.canRecordOwnerCash}
          invoices={props.tenantInvoices}
          openingAuthority={props.openingAuthority}
          openModal={openModal}
          ownerInvoices={props.ownerInvoices}
          positions={props.positions}
        />
      ),
      context: `${props.positions.length} properties`,
      contextHref: "/balances",
      title: "Balances",
      toolbar: undefined,
    };
  }

  if (props.view === "account") {
    const position =
      props.positions.find(
        (item) => item.propertyId === props.selectedPropertyId,
      ) ?? null;
    return {
      activeRoute: "/balances" as const,
      actions:
        props.canRecordOwnerCash &&
        position?.ownerPersonId &&
        position.availableWithdrawal > 0 ? (
          <Button
            onClick={() => openModal({ mode: "withdrawal", position })}
            variant="default"
          >
            Record withdrawal
          </Button>
        ) : undefined,
      body: (
        <PropertyAccountView
          entries={props.accountEntries}
          position={position}
        />
      ),
      context: (
        <Link
          className="inline-flex items-center gap-1 text-sm"
          href="/balances"
        >
          <ArrowLeft size={13} /> Balances
        </Link>
      ),
      contextHref: position
        ? `/properties/${position.propertyId}/account`
        : "/balances",
      title: position?.propertyLabel ?? "Property account",
      toolbar: undefined,
    };
  }

  return {
    activeRoute: "/finance" as const,
    actions: props.canRecordPayments ? (
      <Button onClick={() => openModal({ mode: "payment" })} variant="default">
        <WalletCards size={15} /> Record payment
      </Button>
    ) : undefined,
    body: (
      <FinanceWorkView
        canConfigureRent={canConfigureRent}
        canRecordOwnerCash={props.canRecordOwnerCash}
        canRecordPayments={props.canRecordPayments}
        canRetryCurrentRent={props.canRetryCurrentRent}
        leases={props.leases}
        openDrawer={openDrawer}
        openModal={openModal}
        ownerInvoices={props.ownerInvoices}
        rentGenerationExceptions={props.rentGenerationExceptions}
        tenantInvoices={props.tenantInvoices}
      />
    ),
    context: "Open work",
    contextHref: "/finance",
    title: "Finance work",
    toolbar: undefined,
  };
}

function FinanceWorkView({
  canConfigureRent,
  canRecordOwnerCash,
  canRecordPayments,
  canRetryCurrentRent,
  leases,
  openDrawer,
  openModal,
  ownerInvoices,
  rentGenerationExceptions,
  tenantInvoices,
}: {
  canConfigureRent: boolean;
  canRecordOwnerCash: boolean;
  canRecordPayments: boolean;
  canRetryCurrentRent: boolean;
  leases: FinanceLease[];
  openDrawer: (drawer: DrawerState) => void;
  openModal: (modal: ModalState) => void;
  ownerInvoices: OwnerInvoiceSummary[];
  rentGenerationExceptions: RentGenerationException[];
  tenantInvoices: TenantInvoiceSummary[];
}) {
  const leasesNeedingSetup = leases.filter(
    (lease) =>
      (lease.status === "active" || lease.status === "notice_given") &&
      !lease.billing,
  );
  const leaseById = new Map(leases.map((lease) => [lease.id, lease]));
  const tenantDue = tenantInvoices.filter((invoice) => invoice.balanceDue > 0);
  const ownerDue = ownerInvoices.filter((invoice) => invoice.balanceDue > 0);
  const workCount =
    leasesNeedingSetup.length +
    rentGenerationExceptions.length +
    tenantDue.length +
    ownerDue.length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:px-6 sm:py-4">
      <CompactTotals
        variant="cards"
        items={[
          { label: "Needs setup", value: leasesNeedingSetup.length },
          { label: "Rent exceptions", value: rentGenerationExceptions.length },
          { label: "Tenant balances", value: tenantDue.length },
          { label: "Owner balances", value: ownerDue.length },
        ]}
      />
      <Card
        className="min-h-0 flex-1 gap-0 py-0"
        data-slot="finance-work-surface"
      >
        {workCount === 0 ? (
          <EmptyState
            body="Billing and balances are up to date."
            className="flex-1"
            kind="empty"
            title="No finance work"
          />
        ) : (
          <TableFrame>
            <Table className="min-w-[860px]">
              <thead className="bg-[var(--table-header-bg)]">
                <tr>
                  <Th>Work</Th>
                  <Th>Property</Th>
                  <Th>Amount</Th>
                  <Th>Due</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {leasesNeedingSetup.map((lease) => (
                  <tr
                    className="border-b border-border"
                    key={`setup-${lease.id}`}
                  >
                    <Td>
                      <p className="font-medium">Set up lease billing</p>
                      <p className="text-xs text-muted-foreground">
                        {lease.tenantLabel} · {lease.unitLabel}
                      </p>
                    </Td>
                    <Td>{lease.propertyLabel}</Td>
                    <Td>—</Td>
                    <Td>Before invoicing</Td>
                    <Td align="right">
                      {canConfigureRent ? (
                        <Button
                          onClick={() => openDrawer({ lease, mode: "billing" })}
                        >
                          Set up
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Super Admin setup
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
                {rentGenerationExceptions.map((exception) => (
                  <RentGenerationExceptionRow
                    canRecover={canRetryCurrentRent}
                    exception={exception}
                    key={`rent-exception-${exception.id}`}
                    lease={leaseById.get(exception.leaseId) ?? null}
                  />
                ))}
                {tenantDue.map((invoice) => (
                  <tr
                    className="border-b border-border"
                    key={`tenant-${invoice.id}`}
                  >
                    <Td>
                      <p className="font-medium">
                        {invoice.collectionRoute === "through_ips"
                          ? "Tenant payment"
                          : "Confirm owner collection"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {invoice.recipientLabel} · {invoice.invoiceNumber}
                      </p>
                    </Td>
                    <Td>{invoice.propertyLabel}</Td>
                    <Td>
                      <Money amount={invoice.balanceDue} />
                    </Td>
                    <Td>{formatDate(invoice.dueDate)}</Td>
                    <Td align="right">
                      {canRecordPayments ? (
                        <Button
                          onClick={() => openModal({ invoice, mode: "payment" })}
                        >
                          {invoice.collectionRoute === "through_ips"
                            ? "Record"
                            : "Confirm"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Read only
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
                {ownerDue.map((invoice) => (
                  <tr
                    className="border-b border-border"
                    key={`owner-${invoice.id}`}
                  >
                    <Td>
                      <p className="font-medium">Owner payment</p>
                      <p className="text-xs text-muted-foreground">
                        {invoice.ownerLabel} · {invoice.invoiceNumber}
                      </p>
                    </Td>
                    <Td>{invoice.propertyLabel}</Td>
                    <Td>
                      <Money amount={invoice.balanceDue} />
                    </Td>
                    <Td>{formatDate(invoice.dueDate)}</Td>
                    <Td align="right">
                      {canRecordOwnerCash ? (
                        <Button
                          onClick={() =>
                            openModal({ invoice, mode: "owner-payment" })
                          }
                        >
                          Record
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Read only
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        )}
      </Card>
    </div>
  );
}

function RentGenerationExceptionRow({
  canRecover,
  exception,
  lease,
}: {
  canRecover: boolean;
  exception: RentGenerationException;
  lease: FinanceLease | null;
}) {
  const monthLabel = formatLeaseMonth(exception.billingPeriodStart);

  return (
    <tr className="border-b border-border">
      <Td>
        <p className="font-medium">Rent generation needs attention</p>
        <p className="text-xs text-muted-foreground">{exception.message}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {exception.attemptCount}{" "}
          {exception.attemptCount === 1 ? "attempt" : "attempts"}
        </p>
      </Td>
      <Td>{lease?.propertyLabel ?? "Property unavailable"}</Td>
      <Td>{lease ? <Money amount={lease.monthlyRent} /> : "—"}</Td>
      <Td>{monthLabel}</Td>
      <Td align="right">
        {canRecover ? (
          <RentGenerationRetry
            exceptionId={exception.id}
            monthLabel={monthLabel}
          />
        ) : (
          <span className="text-xs text-muted-foreground">
            Super Admin retry
          </span>
        )}
      </Td>
    </tr>
  );
}

function RentGenerationRetry({
  exceptionId,
  monthLabel,
}: {
  exceptionId: string;
  monthLabel: string;
}) {
  const [state, action, pending] = useActionState(
    recoverRentGenerationExceptionAction,
    actionInitialState,
  );

  return (
    <form action={action} className="space-y-1">
      <input name="exceptionId" type="hidden" value={exceptionId} />
      <Button
        aria-label={`Retry rent for ${monthLabel}`}
        disabled={pending}
        type="submit"
      >
        {pending ? "Retrying..." : "Retry"}
      </Button>
      {state.message ? (
        <p
          className={cn(
            "max-w-48 text-xs",
            state.status === "error" ? "text-destructive" : "text-success",
          )}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function HistoricalRentRecoveryForm({
  leases,
  onSuccess,
}: {
  leases: FinanceLease[];
  onSuccess: (message: string) => void;
}) {
  const eligibleLeases = leases.filter(
    (lease) =>
      lease.status === "active" ||
      lease.status === "notice_given" ||
      lease.status === "ended" ||
      lease.status === "terminated",
  );
  const [state, action] = useActionState(
    recoverLeaseRentPeriodAction,
    actionInitialState,
  );
  useSuccess(state, onSuccess);

  if (eligibleLeases.length === 0) {
    return (
      <EmptyState
        body="A current or ended lease with confirmed historical rent setup is required."
        className="h-full"
        kind="empty"
        title="No eligible leases"
      />
    );
  }

  return (
    <form action={action} className="space-y-4 p-4">
      <p className="text-sm text-muted-foreground">
        Generate one missed completed month, including a month before a lease
        ended. This never fills earlier or later months automatically.
      </p>
      <Field label="Lease">
        <SelectControl
          defaultValue={eligibleLeases[0]?.id}
          name="leaseId"
          options={eligibleLeases.map((lease) => ({
            label: `${lease.tenantLabel} · ${lease.unitLabel}`,
            value: lease.id,
          }))}
          required
        />
      </Field>
      <Field label="Missed rent month">
        <MonthPickerField
          ariaLabel="Missed rent month"
          defaultValue={getPreviousBusinessMonthValue()}
          name="billingPeriod"
          required
        />
      </Field>
      <ActionMessage state={state} />
      <FormFooter>
        <span className="text-xs text-muted-foreground">
          Existing lease-month invoices are replayed safely.
        </span>
        <SubmitButton label="Generate selected month" />
      </FormFooter>
    </form>
  );
}

function RentView({
  canCorrectFinance,
  canRecordPayments,
  invoices,
  openModal,
  organizationName,
}: {
  canCorrectFinance: boolean;
  canRecordPayments: boolean;
  invoices: TenantInvoiceSummary[];
  openModal: (modal: ModalState) => void;
  organizationName: string;
}) {
  const unpaid = invoices.reduce((sum, invoice) => sum + invoice.balanceDue, 0);
  const collected = invoices.reduce(
    (sum, invoice) => sum + invoice.paidThroughIps + invoice.collectedByOwner,
    0,
  );
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:px-6 sm:py-4">
      <CompactTotals
        variant="cards"
        items={[
          { label: "Collected", value: <Money amount={collected} /> },
          { label: "Outstanding", value: <Money amount={unpaid} /> },
          { label: "Invoices", value: invoices.length },
        ]}
      />
      <Card
        className="min-h-0 flex-1 gap-0 py-0"
        data-slot="rent-invoices-surface"
      >
        {invoices.length === 0 ? (
          <EmptyState
            body="Rent invoices are generated automatically when the lease, billing, and rent policy setup is ready."
            className="flex-1"
            kind="empty"
            title="No rent invoices"
          />
        ) : (
          <TableFrame>
            <Table className="min-w-[980px]">
              <thead className="bg-[var(--table-header-bg)]">
                <tr>
                  <Th>Invoice</Th>
                  <Th>Billed to</Th>
                  <Th>Property</Th>
                  <Th>Collection</Th>
                  <Th>Total</Th>
                  <Th>Balance</Th>
                  <Th>Status</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr className="border-b border-border" key={invoice.id}>
                    <Td>
                      <p className="font-medium">{invoice.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        Due {formatDate(invoice.dueDate)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatLeaseMonth(invoice.billingPeriodStart)} lease month
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge tone="neutral">
                          {getRentGenerationLabel(invoice.generationSource)}
                        </Badge>
                        {invoice.isProrated ? (
                          <Badge tone="accent">Prorated</Badge>
                        ) : null}
                      </div>
                    </Td>
                    <Td>
                      <p>{invoice.recipientLabel}</p>
                      {invoice.occupantLabels.length ? (
                        <p className="text-xs text-muted-foreground">
                          Occupants: {invoice.occupantLabels.join(", ")}
                        </p>
                      ) : null}
                    </Td>
                    <Td>
                      <p>{invoice.propertyLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {invoice.unitLabel}
                      </p>
                    </Td>
                    <Td>
                      {invoice.collectionRoute === "through_ips"
                        ? `Collected by ${organizationName}`
                        : "Collected by owner"}
                    </Td>
                    <Td>
                      <Money amount={invoice.totalAmount} />
                    </Td>
                    <Td>
                      <Money amount={invoice.balanceDue} />
                    </Td>
                    <Td>
                      <StatusBadge status={invoice.paymentStatus} />
                    </Td>
                    <Td align="right">
                      {canRecordPayments || canCorrectFinance ? (
                        <div className="flex justify-end gap-2">
                          {canRecordPayments && invoice.balanceDue > 0 ? (
                            <Button
                              onClick={() =>
                                openModal({ invoice, mode: "payment" })
                              }
                            >
                              {invoice.collectionRoute === "through_ips"
                                ? "Record payment"
                                : "Confirm collected"}
                            </Button>
                          ) : null}
                          {canCorrectFinance && invoice.settlements.some(
                            (settlement) => !settlement.isReversed,
                          ) ? (
                            <Button
                              onClick={() =>
                                openModal({
                                  invoice,
                                  mode: "settlement-reversal",
                                })
                              }
                              variant="outline"
                            >
                              Correct
                            </Button>
                          ) : null}
                          {invoice.balanceDue <= 0 &&
                          !invoice.settlements.some(
                            (settlement) => !settlement.isReversed,
                          ) ? (
                            <span className="self-center text-xs text-muted-foreground">
                              Done
                            </span>
                          ) : null}
                        </div>
                      ) : invoice.balanceDue <= 0 ? (
                        <span className="text-xs text-muted-foreground">
                          Done
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Read only
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        )}
      </Card>
    </div>
  );
}

function ExpensesView({
  canReview,
  canReverse,
  openModal,
  submissions,
}: {
  canReview: boolean;
  canReverse: boolean;
  openModal: (modal: ModalState) => void;
  submissions: FinanceOperationsData["expenseSubmissions"];
}) {
  const [status, setStatus] = useState<ExpenseSubmissionSummary["status"]>(
    "submitted",
  );

  if (submissions.length === 0) {
    return (
      <EmptyState
        body="Submit a paid property cost for Finance review. Nothing affects balances until approval."
        className="h-full"
        kind="empty"
        title="No expenses"
      />
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Tabs
        onValueChange={(value) =>
          setStatus(value as ExpenseSubmissionSummary["status"])
        }
        value={status}
      >
        <TabsList aria-label="Expense status">
          {(
            ["submitted", "approved", "rejected", "reversed"] as const
          ).map((value) => (
            <TabsTrigger key={value} value={value}>
              {expenseStatusLabel(value)} (
              {submissions.filter((item) => item.status === value).length})
            </TabsTrigger>
          ))}
        </TabsList>
        {(["submitted", "approved", "rejected", "reversed"] as const).map(
          (value) => (
            <TabsContent key={value} value={value}>
              <ExpenseSubmissionTable
                canReview={canReview}
                canReverse={canReverse}
                openModal={openModal}
                status={value}
                submissions={submissions.filter(
                  (submission) => submission.status === value,
                )}
              />
            </TabsContent>
          ),
        )}
      </Tabs>

    </div>
  );
}

function ExpenseSubmissionTable({
  canReview,
  canReverse,
  openModal,
  status,
  submissions,
}: {
  canReview: boolean;
  canReverse: boolean;
  openModal: (modal: ModalState) => void;
  status: ExpenseSubmissionSummary["status"];
  submissions: ExpenseSubmissionSummary[];
}) {
  if (submissions.length === 0) {
    return (
      <EmptyState
        body="There are no expenses in this status."
        className="min-h-56"
        kind="empty"
        title={`No ${expenseStatusLabel(status).toLowerCase()} expenses`}
      />
    );
  }

  return (
    <TableFrame>
      <Table className="min-w-[1080px]">
        <thead className="bg-[var(--table-header-bg)]">
          <tr>
            <Th>Date</Th>
            <Th>Expense</Th>
            <Th>Property</Th>
            <Th>Charged to</Th>
            <Th>Paid</Th>
            <Th>Billed</Th>
            <Th>Status</Th>
            <Th>Action</Th>
          </tr>
        </thead>
        <tbody>
          {submissions.map((submission) => (
            <tr className="border-b border-border" key={submission.id}>
              <Td>{formatDate(submission.date)}</Td>
              <Td>
                <p className="font-medium">
                  {categoryLabel(submission.category)}
                </p>
                {submission.sourceType === "maintenance_task" ? (
                  <Badge className="mt-1" tone="neutral">
                    {submission.adjustsSubmissionId
                      ? "Maintenance adjustment"
                      : "Maintenance cost"}
                  </Badge>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {submission.vendorLabel}
                </p>
                {submission.reference ? (
                  <p className="text-xs text-muted-foreground">
                    Ref: {submission.reference}
                  </p>
                ) : null}
                {submission.evidence ? (
                  submission.evidence.href ? (
                    <a
                      className="text-xs text-primary underline-offset-2 hover:underline"
                      href={submission.evidence.href}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {submission.evidence.fileName}
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {submission.evidence.fileName} (file unavailable)
                    </p>
                  )
                ) : null}
              </Td>
              <Td>
                <p>{submission.propertyLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {submission.unitLabel}
                </p>
              </Td>
              <Td>
                <Badge
                  tone={
                    submission.responsibility === "owner"
                      ? "accent"
                      : "neutral"
                  }
                >
                  {submission.responsibility === "owner"
                    ? "Property owner"
                    : "Tenant or company"}
                </Badge>
                <p className="mt-1 text-xs text-muted-foreground">
                  {submission.fundingSourceLabel}
                </p>
              </Td>
              <Td>
                <Money amount={submission.internalCost} />
                {submission.adjustsSubmissionId &&
                submission.recordedTotal !== null &&
                submission.recordedTotal !== undefined ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Recorded total {formatMoneyDisplay(submission.recordedTotal).primary}
                  </p>
                ) : null}
              </Td>
              <Td>
                <Money amount={submission.customerTotal} />
              </Td>
              <Td>
                <Badge tone={expenseStatusTone(submission.status)}>
                  {expenseStatusLabel(submission.status)}
                </Badge>
                {submission.reviewReason || submission.reversalReason ? (
                  <p className="mt-1 max-w-52 text-xs text-muted-foreground">
                    {submission.reversalReason ?? submission.reviewReason}
                  </p>
                ) : null}
              </Td>
              <Td>
                {submission.status === "submitted" && canReview ? (
                  <div className="flex gap-2">
                    <Button
                      aria-label={`Approve ${submission.vendorLabel}`}
                      onClick={() =>
                        openModal({
                          decision: "approve",
                          mode: "expense-review",
                          submission,
                        })
                      }
                      size="sm"
                      variant="default"
                    >
                      Approve
                    </Button>
                    <Button
                      aria-label={`Reject ${submission.vendorLabel}`}
                      onClick={() =>
                        openModal({
                          decision: "reject",
                          mode: "expense-review",
                          submission,
                        })
                      }
                      size="sm"
                      variant="outline"
                    >
                      Reject
                    </Button>
                  </div>
                ) : submission.status === "approved" && canReverse ? (
                  <Button
                    aria-label={`Reverse ${submission.vendorLabel}`}
                    onClick={() =>
                      openModal({
                        mode: "expense-reversal",
                        submission,
                      })
                    }
                    size="sm"
                    variant="outline"
                  >
                    Reverse
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Read only
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableFrame>
  );
}

function BalancesView({
  canRecordOwnerCash,
  invoices,
  openingAuthority,
  openModal,
  ownerInvoices,
  positions,
}: {
  canRecordOwnerCash: boolean;
  invoices: TenantInvoiceSummary[];
  openingAuthority?: ReactNode;
  openModal: (modal: ModalState) => void;
  ownerInvoices: OwnerInvoiceSummary[];
  positions: PropertyFinancePosition[];
}) {
  const [tab, setTab] = useState<"owners" | "tenants">("owners");
  const tenantBalances = useMemo(() => {
    const map = new Map<
      string,
      { label: string; total: number; invoices: number; settled: number }
    >();
    for (const invoice of invoices) {
      const current = map.get(invoice.recipientLabel) ?? {
        invoices: 0,
        label: invoice.recipientLabel,
        settled: 0,
        total: 0,
      };
      current.invoices += 1;
      current.settled += invoice.paidThroughIps + invoice.collectedByOwner;
      current.total += invoice.balanceDue;
      map.set(invoice.recipientLabel, current);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [invoices]);

  return (
    <div className="h-full min-h-0 overflow-auto bg-background">
      {openingAuthority ? <div>{openingAuthority}</div> : null}
      <section
        aria-labelledby="current-balance-projection-heading"
        className="min-h-[420px]"
      >
        <div className="border-b px-4 py-3 sm:px-6">
          <h2
            className="text-base font-semibold"
            id="current-balance-projection-heading"
          >
            Current balance projection
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Operational view only. This is not an official owner statement.
          </p>
        </div>
        <Tabs
          className="min-h-0 gap-0 bg-background"
          onValueChange={(value) => setTab(value as "owners" | "tenants")}
          value={tab}
        >
      <TabsList
        className="h-11 w-full shrink-0 justify-start rounded-none border-b px-4 sm:px-6"
        variant="line"
      >
        <TabsTrigger className="flex-none px-3" value="owners">
          Owners
        </TabsTrigger>
        <TabsTrigger className="flex-none px-3" value="tenants">
          Tenants &amp; companies
        </TabsTrigger>
      </TabsList>
      <TabsContent className="min-h-0 overflow-auto" tabIndex={-1} value="owners">
        <TableFrame>
          <Table className="min-w-[1040px]">
            <thead className="bg-[var(--table-header-bg)]">
              <tr>
                <Th>Property</Th>
                <Th>Owner</Th>
                <Th>Running balance</Th>
                <Th>Owner funds held</Th>
                <Th>Owner amount due</Th>
                <Th>Available</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => {
                const ownerInvoice = ownerInvoices.find(
                  (invoice) =>
                    invoice.propertyId === position.propertyId &&
                    invoice.balanceDue > 0,
                );
                return (
                  <tr
                    className="border-b border-border"
                    key={position.propertyId}
                  >
                    <Td>
                      <Link
                        className="font-medium hover:underline"
                        href={`/properties/${position.propertyId}/account`}
                      >
                        {position.propertyLabel}
                      </Link>
                    </Td>
                    <Td>{position.ownerLabel}</Td>
                    <Td>
                      <Money amount={position.runningBalance} />
                    </Td>
                    <Td>
                      <Money amount={position.cashHeldByIps} />
                    </Td>
                    <Td>
                      <Money amount={position.ownerOwesIps} />
                    </Td>
                    <Td>
                      <Money amount={position.availableWithdrawal} />
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        {canRecordOwnerCash && ownerInvoice ? (
                          <Button
                            onClick={() =>
                              openModal({
                                invoice: ownerInvoice,
                                mode: "owner-payment",
                              })
                            }
                          >
                            Owner payment
                          </Button>
                        ) : null}
                        {canRecordOwnerCash &&
                        position.ownerPersonId &&
                        position.availableWithdrawal > 0 ? (
                          <Button
                            onClick={() =>
                              openModal({ mode: "withdrawal", position })
                            }
                          >
                            Withdrawal
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
      </TabsContent>
      <TabsContent className="min-h-0 overflow-auto" tabIndex={-1} value="tenants">
        <TableFrame>
          <Table className="min-w-[720px]">
            <thead className="bg-[var(--table-header-bg)]">
              <tr>
                <Th>Customer</Th>
                <Th>Invoices</Th>
                <Th>Outstanding</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {tenantBalances.map((balance) => (
                <tr className="border-b border-border" key={balance.label}>
                  <Td className="font-medium">{balance.label}</Td>
                  <Td>{balance.invoices}</Td>
                  <Td>
                    <Money amount={balance.total} />
                  </Td>
                  <Td>
                    <StatusBadge
                      status={
                        balance.total === 0
                          ? "paid"
                          : balance.settled > 0
                            ? "partly_paid"
                            : "unpaid"
                      }
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function PropertyAccountView({
  entries,
  position,
}: {
  entries: FinanceOperationsData["accountEntries"];
  position: PropertyFinancePosition | null;
}) {
  if (!position)
    return (
      <EmptyState
        body="This property account is not available."
        className="h-full"
        kind="empty"
        title="Account unavailable"
      />
    );
  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <CompactTotals
        items={[
          {
            label: "Running balance",
            value: <Money amount={position.runningBalance} />,
          },
          {
            label: "Owner funds held",
            value: <Money amount={position.cashHeldByIps} />,
          },
          {
            label: "Owner amount due",
            value: <Money amount={position.ownerOwesIps} />,
          },
          {
            label: "Available withdrawal",
            value: <Money amount={position.availableWithdrawal} />,
          },
        ]}
      />
      {entries.length === 0 ? (
        <EmptyState
          body="Rent, fees, owner costs, and withdrawals will appear here."
          className="flex-1"
          kind="empty"
          title="No account activity"
        />
      ) : (
        <TableFrame>
          <Table className="min-w-[820px]">
            <thead className="bg-[var(--table-header-bg)]">
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Details</Th>
                <Th>Amount</Th>
                <Th>Running balance</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  className="border-b border-border"
                  key={`${entry.category}-${entry.id}`}
                >
                  <Td>{formatDate(entry.date)}</Td>
                  <Td>{entry.label}</Td>
                  <Td className="text-muted-foreground">{entry.note ?? "—"}</Td>
                  <Td>
                    <Money
                      amount={
                        entry.category === "rent_income"
                          ? entry.amount
                          : -entry.amount
                      }
                    />
                  </Td>
                  <Td>
                    <Money amount={entry.runningBalance} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}

function BillingSetupForm({
  lease,
  onSuccess,
  organizationName,
  peopleOptions,
}: {
  lease: FinanceLease;
  onSuccess: (message: string) => void;
  organizationName: string;
  peopleOptions: FinanceOperationsData["peopleOptions"];
}) {
  const idempotencyKey = useStableActionId("billing");
  const [step, setStep] = useState(1);
  const [state, action] = useActionState(
    saveLeaseBillingAction,
    actionInitialState,
  );
  const [recipientKind, setRecipientKind] = useState<"company" | "individual">(
    lease.billing?.billingRecipientKind ?? "individual",
  );
  const [recipientId, setRecipientId] = useState(
    lease.billing?.billingRecipientPersonId ?? lease.tenantPersonId ?? "",
  );
  const [firstProrata, setFirstProrata] = useState(
    lease.billing?.firstPeriodProratedAmount?.toString() ?? "",
  );
  const [finalProrata, setFinalProrata] = useState(
    lease.billing?.finalPeriodProratedAmount?.toString() ?? "",
  );
  const [route, setRoute] = useState<"direct_to_owner" | "through_ips">(
    lease.billing?.collectionRoute ?? "through_ips",
  );
  const [feeMode, setFeeMode] = useState<"flat" | "percentage">(
    lease.billing?.managementFeeMode ?? "percentage",
  );
  const [feeValue, setFeeValue] = useState(
    lease.billing?.managementFeeValue.toString() ?? "10",
  );
  const [chargeFee, setChargeFee] = useState(
    lease.billing?.chargeManagementFeeWhenActive ?? true,
  );
  const [fullFeeDuringProration, setFullFeeDuringProration] = useState(
    lease.billing?.fullManagementFeeDuringProration ?? true,
  );
  const today = getBusinessDateValue();
  useSuccess(state, onSuccess);
  return (
    <form action={action} className="space-y-4 p-4">
      <StepIndicator
        current={step}
        labels={[
          "Property & owner",
          "Lease billing",
          "Collection & fee",
          "Review",
        ]}
      />
      <input name="leaseId" type="hidden" value={lease.id} />
      <input
        name="effectiveFrom"
        type="hidden"
        value={lease.billing?.effectiveFrom ?? lease.startDate ?? today}
      />
      <input name="billingRecipientKind" type="hidden" value={recipientKind} />
      <input
        name="billingRecipientPersonId"
        type="hidden"
        value={recipientId}
      />
      <input
        name="firstPeriodProratedAmount"
        type="hidden"
        value={firstProrata}
      />
      <input
        name="finalPeriodProratedAmount"
        type="hidden"
        value={finalProrata}
      />
      <input name="collectionRoute" type="hidden" value={route} />
      <input name="managementFeeMode" type="hidden" value={feeMode} />
      <input name="managementFeeValue" type="hidden" value={feeValue} />
      <input
        name="chargeManagementFeeWhenActive"
        type="hidden"
        value={chargeFee ? "on" : ""}
      />
      <input
        name="fullManagementFeeDuringProration"
        type="hidden"
        value={fullFeeDuringProration ? "on" : ""}
      />
      <input
        name="supersedesBillingTermId"
        type="hidden"
        value={lease.billing?.id ?? ""}
      />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />

      {step === 1 ? (
        <DefinitionRows
          rows={[
            ["Property", lease.propertyLabel],
            ["Owner", lease.ownerLabel],
            ["Lease", `${lease.tenantLabel} · ${lease.unitLabel}`],
            ["Monthly rent", formatMoneyDisplay(lease.monthlyRent).primary],
          ]}
        />
      ) : null}
      {step === 2 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bill to">
            <SelectControl
              onValueChange={(value) =>
                setRecipientKind(value as "company" | "individual")
              }
              options={[
                { label: "Individual tenant", value: "individual" },
                { label: "Company", value: "company" },
              ]}
              value={recipientKind}
            />
          </Field>
          <Field label={recipientKind === "company" ? "Company" : "Tenant"}>
            <SelectControl
              onValueChange={setRecipientId}
              options={peopleOptions.map((option) => ({
                label: option.label,
                value: option.id,
              }))}
              value={recipientId}
            />
          </Field>
          <Field label="First month amount (optional)">
            <NumberInput
              onChange={(event) => setFirstProrata(event.target.value)}
              placeholder="Use full rent"
              value={firstProrata}
            />
          </Field>
          <Field label="Final month amount (optional)">
            <NumberInput
              onChange={(event) => setFinalProrata(event.target.value)}
              placeholder="Use full rent"
              value={finalProrata}
            />
          </Field>
        </div>
      ) : null}
      {step === 3 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Who collects rent?">
            <SelectControl
              onValueChange={(value) => setRoute(value as typeof route)}
              options={[
                {
                  label: `Collected by ${organizationName}`,
                  value: "through_ips",
                },
                { label: "Collected by owner", value: "direct_to_owner" },
              ]}
              value={route}
            />
          </Field>
          <Field label="Management fee">
            <SelectControl
              onValueChange={(value) => setFeeMode(value as typeof feeMode)}
              options={[
                { label: "Percentage", value: "percentage" },
                { label: "Flat amount", value: "flat" },
              ]}
              value={feeMode}
            />
          </Field>
          <Field
            label={feeMode === "percentage" ? "Fee percentage" : "Fee amount"}
          >
            <NumberInput
              onChange={(event) => setFeeValue(event.target.value)}
              required
              value={feeValue}
            />
          </Field>
          <div className="space-y-2 pt-5">
            <Checkbox
              checked={chargeFee}
              label="Charge fee while lease is active"
              onChange={setChargeFee}
            />
            <Checkbox
              checked={fullFeeDuringProration}
              label="Keep full fee in pro-rata months"
              onChange={setFullFeeDuringProration}
            />
          </div>
        </div>
      ) : null}
      {step === 4 ? (
        <DefinitionRows
          rows={[
            [
              "Bill to",
              peopleOptions.find((item) => item.id === recipientId)?.label ??
                "Not selected",
            ],
            [
              "Collection",
              route === "through_ips"
                ? `Collected by ${organizationName}`
                : "Collected by owner",
            ],
            [
              "Management fee",
              feeMode === "percentage"
                ? `${feeValue}%`
                : formatMoneyDisplay(Number(feeValue || 0)).primary,
            ],
            [
              "Pro-rata",
              firstProrata || finalProrata
                ? "Manual first/final amount"
                : "Full monthly rent",
            ],
          ]}
        />
      ) : null}
      <ActionMessage state={state} />
      <FormFooter>
        {step > 1 ? (
          <Button onClick={() => setStep((current) => current - 1)}>
            Back
          </Button>
        ) : (
          <span />
        )}
        {step < 4 ? (
          <Button
            disabled={step === 2 && !recipientId}
            onClick={() => setStep((current) => current + 1)}
            variant="default"
          >
            Continue <ChevronRight size={14} />
          </Button>
        ) : (
          <SubmitButton label="Activate billing" />
        )}
      </FormFooter>
    </form>
  );
}

function PaymentChooser({
  invoices,
  onChoose,
}: {
  invoices: TenantInvoiceSummary[];
  onChoose: (invoice: TenantInvoiceSummary) => void;
}) {
  return (
    <div className="max-h-[520px] overflow-y-auto p-2">
      {invoices.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          There are no open tenant invoices.
        </p>
      ) : (
        invoices.map((invoice) => (
          <Button
            className="h-auto w-full justify-between gap-4 px-3 py-3 text-left"
            key={invoice.id}
            onClick={() => onChoose(invoice)}
            type="button"
            variant="ghost"
          >
            <span>
              <span className="block text-sm font-medium">
                {invoice.recipientLabel}
              </span>
              <span className="block text-xs text-muted-foreground">
                {invoice.propertyLabel} · {invoice.invoiceNumber}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Money amount={invoice.balanceDue} />
              <ChevronRight className="text-muted-foreground" size={15} />
            </span>
          </Button>
        ))
      )}
    </div>
  );
}

function SettleInvoiceForm({
  invoice,
  onChooseAnother,
  onSuccess,
  reconciliationSources,
}: {
  invoice: TenantInvoiceSummary;
  onChooseAnother?: () => void;
  onSuccess: (message: string) => void;
  reconciliationSources: FinanceOperationsData["reconciliationSources"];
}) {
  const idempotencyKey = useStableActionId(
    invoice.collectionRoute === "through_ips" ? "payment" : "owner-confirm",
  );
  const action =
    invoice.collectionRoute === "through_ips"
      ? recordTenantInvoicePaymentAction
      : confirmOwnerCollectionAction;
  const [state, formAction] = useActionState(action, actionInitialState);
  const sources = reconciliationSources.filter(
    (source) => !source.propertyId || source.propertyId === invoice.propertyId,
  );
  useSuccess(state, onSuccess);
  return (
    <form action={formAction} className="space-y-4 p-4">
      <DefinitionRows
        rows={[
          ["Invoice", invoice.invoiceNumber],
          ["Customer", invoice.recipientLabel],
          ["Balance", formatMoneyDisplay(invoice.balanceDue).primary],
        ]}
      />
      <input name="invoiceId" type="hidden" value={invoice.id} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount">
          <NumberInput
            defaultValue={invoice.balanceDue}
            name="amount"
            required
          />
        </Field>
        <Field
          label={
            invoice.collectionRoute === "through_ips"
              ? "Received date"
              : "Confirmed date"
          }
        >
          <DatePickerField
            defaultValue={getBusinessDateValue()}
            name="settlementDate"
            required
          />
        </Field>
        {invoice.collectionRoute === "through_ips" ? (
          <Field label="Received in">
            <SelectControl
              name="reconciliationSourceId"
              options={sources.map((source) => ({
                label: source.label,
                value: source.id,
              }))}
              required
            />
          </Field>
        ) : null}
        <Field label="Reference">
          <Input name="reference" placeholder="Optional" />
        </Field>
      </div>
      {invoice.lines.length > 1 ? (
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            Change how payment is applied
          </summary>
          <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
            {invoice.lines
              .filter((line) => line.balanceDue > 0)
              .map((line) => (
                <Field
                  key={line.id}
                  label={`${line.label} · ${formatMoneyDisplay(line.balanceDue).primary}`}
                >
                  <NumberInput
                    name={`allocation:${line.id}`}
                    placeholder="Leave blank for Rent first"
                  />
                </Field>
              ))}
          </div>
        </details>
      ) : null}
      {invoice.collectionRoute === "direct_to_owner" ? (
        <p className="text-xs text-muted-foreground">
          This marks the invoice “Collected by owner” and does not add cash to
          the property account.
        </p>
      ) : null}
      <ActionMessage state={state} />
      <FormFooter>
        {onChooseAnother ? (
          <Button onClick={onChooseAnother}>Choose another</Button>
        ) : (
          <span />
        )}
        <SubmitButton
          label={
            invoice.collectionRoute === "through_ips"
              ? "Record payment"
              : "Confirm collected"
          }
        />
      </FormFooter>
    </form>
  );
}

function ExpenseForm({
  initialInvoiceId,
  initialResponsibility,
  invoices,
  onSuccess,
  propertyOptions,
  reconciliationSources,
  unitOptions,
}: {
  initialInvoiceId?: string;
  initialResponsibility?: "owner" | "tenant";
  invoices: TenantInvoiceSummary[];
  onSuccess: (message: string) => void;
  propertyOptions: FinanceOperationsData["propertyOptions"];
  reconciliationSources: FinanceOperationsData["reconciliationSources"];
  unitOptions: FinanceOperationsData["unitOptions"];
}) {
  const idempotencyKey = useStableActionId("expense");
  const initialInvoice = invoices.find(
    (invoice) => invoice.id === initialInvoiceId,
  );
  const [state, action] = useActionState(
    submitExpenseAction,
    actionInitialState,
  );
  const [propertyId, setPropertyId] = useState(
    initialInvoice?.propertyId ?? propertyOptions[0]?.id ?? "",
  );
  const [unitId, setUnitId] = useState(initialInvoice?.unitId ?? "");
  const [category, setCategory] = useState("cleaning");
  const [vendor, setVendor] = useState("");
  const [cost, setCost] = useState("");
  const [markup, setMarkup] = useState("0");
  const [expenseDate, setExpenseDate] = useState(getBusinessDateValue());
  const [reference, setReference] = useState("");
  const [reconciliationSourceId, setReconciliationSourceId] = useState(
    reconciliationSources.find(
      (source) =>
        source.propertyId == null ||
        source.propertyId === initialInvoice?.propertyId,
    )?.id ?? "",
  );
  const [responsibility, setResponsibility] = useState<"owner" | "tenant">(
    initialResponsibility ?? "owner",
  );
  const [tenantInvoiceId, setTenantInvoiceId] = useState(
    initialInvoiceId ?? "",
  );
  const effectiveResponsibility =
    responsibility === "tenant" ? "tenant" : "owner";
  const matchingInvoices = invoices.filter(
    (invoice) =>
      invoice.propertyId === propertyId &&
      invoice.balanceDue > 0 &&
      (!unitId || invoice.unitId === unitId),
  );
  const matchingSources = reconciliationSources.filter(
    (source) =>
      source.propertyId == null || source.propertyId === propertyId,
  );
  const effectiveMarkup = effectiveResponsibility === "tenant" ? markup : "0";
  const invoiceTotal = Number(cost || 0) + Number(effectiveMarkup || 0);
  useSuccess(state, onSuccess);
  return (
    <form action={action} className="space-y-5 p-5">
      <input name="propertyId" type="hidden" value={propertyId} />
      <input name="unitId" type="hidden" value={unitId} />
      <input name="category" type="hidden" value={category} />
      <input name="vendorLabel" type="hidden" value={vendor} />
      <input name="internalCost" type="hidden" value={cost} />
      <input name="internalMarkup" type="hidden" value={effectiveMarkup} />
      <input name="expenseDate" type="hidden" value={expenseDate} />
      <input name="reference" type="hidden" value={reference} />
      <input
        name="reconciliationSourceId"
        type="hidden"
        value={reconciliationSourceId}
      />
      <input
        name="responsibility"
        type="hidden"
        value={effectiveResponsibility}
      />
      <input
        name="tenantInvoiceId"
        type="hidden"
        value={effectiveResponsibility === "tenant" ? tenantInvoiceId : ""}
      />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Property">
          <SelectControl
            onValueChange={(value) => {
              setPropertyId(value);
              setUnitId("");
              setTenantInvoiceId("");
              setReconciliationSourceId(
                reconciliationSources.find(
                  (source) =>
                    source.propertyId == null || source.propertyId === value,
                )?.id ?? "",
              );
            }}
            options={propertyOptions.map((option) => ({
              label: option.label,
              value: option.id,
            }))}
            value={propertyId}
          />
        </Field>
        <Field label="Unit">
          <SelectControl
            onValueChange={(value) => {
              setUnitId(value);
              const selectedInvoice = invoices.find(
                (invoice) => invoice.id === tenantInvoiceId,
              );
              if (selectedInvoice?.unitId !== (value || null)) {
                setTenantInvoiceId("");
              }
            }}
            options={[
              { label: "No unit", value: "" },
              ...unitOptions
                .filter((option) => option.propertyId === propertyId)
                .map((option) => ({ label: option.label, value: option.id })),
            ]}
            value={unitId}
          />
        </Field>
        <Field label="Expense">
          <SelectControl
            onValueChange={setCategory}
            options={[
              { label: "Cleaning", value: "cleaning" },
              { label: "Utility", value: "utility" },
              {
                label: "Repairs and maintenance",
                value: "repairs_maintenance",
              },
              { label: "Other", value: "other" },
            ]}
            value={category}
          />
        </Field>
        <Field label="Paid to">
          <Input
            onChange={(event) => setVendor(event.target.value)}
            placeholder="Vendor or payee"
            required
            value={vendor}
          />
        </Field>
        <Field label="Amount paid">
          <NumberInput
            onChange={(event) => setCost(event.target.value)}
            required
            value={cost}
          />
        </Field>
        <Field label="Date">
          <Input
            onChange={(event) => setExpenseDate(event.target.value)}
            type="date"
            value={expenseDate}
          />
        </Field>
        <Field label="Paid from">
          <SelectControl
            onValueChange={setReconciliationSourceId}
            options={matchingSources.map((source) => ({
              label: source.label,
              value: source.id,
            }))}
            placeholder={
              matchingSources.length > 0
                ? "Choose funding source"
                : "No funding source"
            }
            value={reconciliationSourceId}
          />
        </Field>
      </div>

      <fieldset className="space-y-2 border-t border-border pt-4">
        <legend className="text-sm font-semibold">Charge this to</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            aria-pressed={effectiveResponsibility === "owner"}
            className={cn(
              "h-auto justify-start px-3 py-3 text-left",
              effectiveResponsibility === "owner"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground",
            )}
            onClick={() => setResponsibility("owner")}
            type="button"
            variant="outline"
          >
            Property owner
          </Button>
          <Button
            aria-pressed={effectiveResponsibility === "tenant"}
            className={cn(
              "h-auto justify-start px-3 py-3 text-left",
              effectiveResponsibility === "tenant"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground",
            )}
            onClick={() => setResponsibility("tenant")}
            type="button"
            variant="outline"
          >
            Tenant or company
          </Button>
        </div>
      </fieldset>

      {effectiveResponsibility === "tenant" ? (
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <Field label="Invoice">
            <SelectControl
              onValueChange={(value) => {
                setTenantInvoiceId(value);
                const invoice = invoices.find((item) => item.id === value);
                setUnitId(invoice?.unitId ?? "");
              }}
              options={matchingInvoices.map((invoice) => ({
                label: `${invoice.recipientLabel} · ${invoice.invoiceNumber}`,
                value: invoice.id,
              }))}
              placeholder={
                matchingInvoices.length > 0
                  ? "Choose invoice"
                  : "No open invoice"
              }
              value={tenantInvoiceId}
            />
          </Field>
          <Field label="Service fee">
            <NumberInput
              onChange={(event) => setMarkup(event.target.value)}
              required
              value={markup}
            />
          </Field>
          <div className="flex items-center justify-between gap-4 border-t border-border pt-3 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Invoice line</span>
            <span className="font-semibold">
              {categoryLabel(category)} ·{" "}
              {formatMoneyDisplay(invoiceTotal).primary}
            </span>
          </div>
        </div>
      ) : null}

      <Field label="Receipt or payment reference">
        <Input
          onChange={(event) => setReference(event.target.value)}
          placeholder="Receipt number, bank transfer, or payment note"
          required
          value={reference}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        This stays awaiting approval and does not affect balances until a
        Finance Manager approves it.
      </p>
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton
          disabled={
            !propertyId ||
            !reconciliationSourceId ||
            !vendor ||
            !reference.trim() ||
            Number(cost) <= 0 ||
            (effectiveResponsibility === "tenant" && !tenantInvoiceId)
          }
          label="Submit for review"
        />
      </FormFooter>
    </form>
  );
}

function ExpenseReviewForm({
  decision,
  onSuccess,
  reconciliationSources,
  submission,
}: {
  decision: "approve" | "reject";
  onSuccess: (message: string) => void;
  reconciliationSources: FinanceOperationsData["reconciliationSources"];
  submission: ExpenseSubmissionSummary;
}) {
  const idempotencyKey = useStableActionId(`expense-${decision}`);
  const [state, action] = useActionState(
    reviewExpenseAction,
    actionInitialState,
  );
  const [reason, setReason] = useState("");
  const [reconciliationSourceId, setReconciliationSourceId] = useState("");
  const needsFundingSource =
    decision === "approve" && submission.sourceType === "maintenance_task";
  const matchingSources = reconciliationSources.filter(
    (source) =>
      source.propertyId === null ||
      source.propertyId === undefined ||
      source.propertyId === submission.propertyId,
  );
  useSuccess(state, onSuccess);

  return (
    <form action={action} className="space-y-4 p-4">
      <input name="decision" type="hidden" value={decision} />
      <input name="submissionId" type="hidden" value={submission.id} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="reason" type="hidden" value={reason} />
      <DefinitionRows
        rows={[
          ["Vendor", submission.vendorLabel],
          ["Property", submission.propertyLabel],
          [
            submission.adjustsSubmissionId ? "Additional paid" : "Paid",
            formatMoneyDisplay(submission.internalCost).primary,
          ],
          ...(submission.adjustsSubmissionId
            ? ([
                [
                  "Previously approved",
                  formatMoneyDisplay(submission.previouslyApproved ?? 0).primary,
                ],
                [
                  "Recorded total",
                  formatMoneyDisplay(
                    submission.recordedTotal ?? submission.internalCost,
                  ).primary,
                ],
              ] satisfies [string, ReactNode][])
            : []),
          ["Charged", formatMoneyDisplay(submission.customerTotal).primary],
          ["Reference", submission.reference ?? "None provided"],
          [
            "Evidence",
            submission.evidence ? (
              submission.evidence.href ? (
                <a
                  className="text-primary underline-offset-2 hover:underline"
                  href={submission.evidence.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {submission.evidence.fileName}
                </a>
              ) : (
                `${submission.evidence.fileName} (file unavailable)`
              )
            ) : (
              "No document attached"
            ),
          ],
          ["Paid from", submission.fundingSourceLabel],
        ]}
      />
      {needsFundingSource ? (
        <Field label="Paid from">
          <SelectControl
            ariaLabel="Paid from"
            name="reconciliationSourceId"
            onValueChange={setReconciliationSourceId}
            options={matchingSources.map((source) => ({
              label: source.label,
              value: source.id,
            }))}
            placeholder="Choose the account used"
            required
            value={reconciliationSourceId}
          />
        </Field>
      ) : (
        <input name="reconciliationSourceId" type="hidden" value="" />
      )}
      <Field
        label={decision === "reject" ? "Rejection reason" : "Review note"}
      >
        <Input
          onChange={(event) => setReason(event.target.value)}
          placeholder={decision === "reject" ? "Required" : "Optional"}
          required={decision === "reject"}
          value={reason}
        />
      </Field>
      {decision === "approve" ? (
        <p className="text-xs text-muted-foreground">
          Approval records the paid cost, customer responsibility, and property
          balance effect together.
        </p>
      ) : null}
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton
          disabled={
            (decision === "reject" && reason.trim().length < 3) ||
            (needsFundingSource && !reconciliationSourceId)
          }
          label={decision === "approve" ? "Approve expense" : "Reject expense"}
        />
      </FormFooter>
    </form>
  );
}

function ExpenseReversalForm({
  onSuccess,
  submission,
}: {
  onSuccess: (message: string) => void;
  submission: ExpenseSubmissionSummary;
}) {
  const idempotencyKey = useStableActionId("expense-reversal");
  const [state, action] = useActionState(
    reverseExpenseAction,
    actionInitialState,
  );
  const [reason, setReason] = useState("");
  useSuccess(state, onSuccess);

  return (
    <form action={action} className="space-y-4 p-4">
      <input name="submissionId" type="hidden" value={submission.id} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="reason" type="hidden" value={reason} />
      <DefinitionRows
        rows={[
          ["Vendor", submission.vendorLabel],
          ["Property", submission.propertyLabel],
          ["Paid", formatMoneyDisplay(submission.internalCost).primary],
          ["Charged", formatMoneyDisplay(submission.customerTotal).primary],
        ]}
      />
      <Field label="Reversal date">
        <DatePickerField
          defaultValue={getBusinessDateValue()}
          name="reversalDate"
          required
        />
      </Field>
      <Field label="Reason">
        <Input
          onChange={(event) => setReason(event.target.value)}
          placeholder="Required"
          required
          value={reason}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Reversal keeps the original record and adds an opposite cash, balance,
        and customer correction.
      </p>
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton
          disabled={reason.trim().length < 3}
          label="Reverse expense"
        />
      </FormFooter>
    </form>
  );
}

function SettlementReversalForm({
  invoice,
  onSuccess,
}: {
  invoice: TenantInvoiceSummary;
  onSuccess: (message: string) => void;
}) {
  const settlements = invoice.settlements.filter(
    (settlement) => !settlement.isReversed,
  );
  const [settlementId, setSettlementId] = useState(settlements[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const idempotencyKey = useStableActionId("settlement-reversal");
  const action =
    invoice.collectionRoute === "through_ips"
      ? reverseTenantInvoicePaymentAction
      : reverseOwnerCollectionConfirmationAction;
  const [state, formAction] = useActionState(action, actionInitialState);
  useSuccess(state, onSuccess);

  if (settlements.length === 0) {
    return (
      <EmptyState
        body="Every recorded settlement for this invoice is already reversed."
        kind="empty"
        title="No settlement to correct"
      />
    );
  }

  return (
    <form action={formAction} className="space-y-4 p-4">
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="reason" type="hidden" value={reason} />
      <DefinitionRows
        rows={[
          ["Invoice", invoice.invoiceNumber],
          ["Customer", invoice.recipientLabel],
          [
            "Collection route",
            invoice.collectionRoute === "through_ips"
              ? "Collected by IPS"
              : "Collected by owner",
          ],
        ]}
      />
      <Field label="Settlement">
        <SelectControl
          ariaLabel="Settlement"
          name="settlementId"
          onValueChange={setSettlementId}
          options={settlements.map((settlement) => ({
            label: settlementOptionLabel(settlement),
            value: settlement.id,
          }))}
          required
          value={settlementId}
        />
      </Field>
      <Field label="Reversal date">
        <DatePickerField
          defaultValue={getBusinessDateValue()}
          name="reversalDate"
          required
        />
      </Field>
      <Field label="Reason">
        <Input
          onChange={(event) => setReason(event.target.value)}
          placeholder="Explain the correction"
          required
          value={reason}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        The original stays in history. Nestory adds an equal opposite invoice,
        property-account, and Ledger event.
      </p>
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton
          disabled={!settlementId || reason.trim().length < 3}
          label="Reverse settlement"
        />
      </FormFooter>
    </form>
  );
}

function settlementOptionLabel(settlement: TenantInvoiceSettlement) {
  const reference = settlement.reference?.trim();
  return [
    formatDate(settlement.date),
    formatMoneyDisplay(settlement.amount).primary,
    reference || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function OwnerPaymentForm({
  invoice,
  onSuccess,
}: {
  invoice: OwnerInvoiceSummary;
  onSuccess: (message: string) => void;
}) {
  const idempotencyKey = useStableActionId("owner-payment");
  const [state, action] = useActionState(
    recordOwnerPaymentAction,
    actionInitialState,
  );
  useSuccess(state, onSuccess);
  return (
    <form action={action} className="space-y-4 p-4">
      <DefinitionRows
        rows={[
          ["Owner", invoice.ownerLabel],
          ["Property", invoice.propertyLabel],
          ["Balance", formatMoneyDisplay(invoice.balanceDue).primary],
        ]}
      />
      <input name="ownerInvoiceId" type="hidden" value={invoice.id} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount">
          <NumberInput
            defaultValue={invoice.balanceDue}
            name="amount"
            required
          />
        </Field>
        <Field label="Received date">
          <DatePickerField
            defaultValue={getBusinessDateValue()}
            name="receivedDate"
            required
          />
        </Field>
        <Field label="Reference">
          <Input name="reference" placeholder="Optional" />
        </Field>
      </div>
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton label="Record owner payment" />
      </FormFooter>
    </form>
  );
}

function WithdrawalForm({
  onSuccess,
  position,
}: {
  onSuccess: (message: string) => void;
  position: PropertyFinancePosition;
}) {
  const idempotencyKey = useStableActionId("withdrawal");
  const [state, action] = useActionState(
    recordWithdrawalAction,
    actionInitialState,
  );
  useSuccess(state, onSuccess);
  return (
    <form action={action} className="space-y-4 p-4">
      <DefinitionRows
        rows={[
          ["Property", position.propertyLabel],
          ["Owner", position.ownerLabel],
          [
            "Available",
            formatMoneyDisplay(position.availableWithdrawal).primary,
          ],
        ]}
      />
      <input name="propertyId" type="hidden" value={position.propertyId} />
      <input
        name="ownerPersonId"
        type="hidden"
        value={position.ownerPersonId ?? ""}
      />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount">
          <NumberInput
            max={position.availableWithdrawal}
            name="amount"
            required
          />
        </Field>
        <Field label="Date">
          <DatePickerField
            defaultValue={getBusinessDateValue()}
            name="withdrawalDate"
            required
          />
        </Field>
        <Field label="Reference">
          <Input name="reference" placeholder="Bank transfer or note" required />
        </Field>
      </div>
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton label="Record withdrawal" />
      </FormFooter>
    </form>
  );
}

function getModalTitle(modal: ModalState) {
  if (modal.mode === "payment")
    return !modal.invoice || modal.invoice.collectionRoute === "through_ips"
      ? "Record payment"
      : "Confirm owner collection";
  if (modal.mode === "owner-payment") return "Owner payment";
  if (modal.mode === "expense-review") {
    return modal.decision === "approve" ? "Approve expense" : "Reject expense";
  }
  if (modal.mode === "expense-reversal") return "Reverse expense";
  if (modal.mode === "settlement-reversal") return "Correct settlement";
  return "Owner withdrawal";
}

function canRenderFinanceModal(
  modal: ModalState,
  capabilities: Pick<
    FinanceOperationsScreenProps,
    | "canCorrectFinance"
    | "canRecordOwnerCash"
    | "canRecordPayments"
    | "canReviewExpense"
    | "canReverseExpense"
  >,
) {
  if (modal.mode === "payment") return capabilities.canRecordPayments;
  if (modal.mode === "settlement-reversal") {
    return capabilities.canCorrectFinance;
  }
  if (modal.mode === "owner-payment" || modal.mode === "withdrawal") {
    return capabilities.canRecordOwnerCash;
  }

  if (modal.mode === "expense-review") {
    return capabilities.canReviewExpense;
  }

  return capabilities.canReverseExpense;
}

function getDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "billing") return "Set up lease billing";
  if (drawer.mode === "rent-recovery") return "Recover missed rent";
  return "Add expense";
}
function useSuccess(
  state: FinanceOperationsActionState,
  onSuccess: (message: string) => void,
) {
  useEffect(() => {
    if (state.status === "success" && state.message) onSuccess(state.message);
  }, [onSuccess, state.message, state.status]);
}
function useStableActionId(prefix: string) {
  const [id] = useState(() => stableId(prefix));
  return id;
}
function stableId(prefix: string) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}
function categoryLabel(category: string) {
  return category === "repairs_maintenance"
    ? "Repairs and Maintenance"
    : category.charAt(0).toUpperCase() + category.slice(1);
}

function expenseStatusLabel(status: ExpenseSubmissionSummary["status"]) {
  if (status === "submitted") return "Awaiting approval";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function expenseStatusTone(
  status: ExpenseSubmissionSummary["status"],
): "danger" | "neutral" | "success" | "warning" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "reversed") return "neutral";
  return "warning";
}

function formatLeaseMonth(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : leaseMonthFormatter.format(date);
}

function getPreviousBusinessMonthValue() {
  const [year, month] = getBusinessDateValue()
    .slice(0, 7)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

function getRentGenerationLabel(
  source: TenantInvoiceSummary["generationSource"],
) {
  if (source === "manual_recovery") return "Recovered by Super Admin";
  if (source === "scheduled" || source === "activation_catch_up") {
    return "Generated automatically";
  }
  return "Existing invoice";
}

function CompactTotals({
  items,
  variant = "strip",
}: {
  items: { label: string; value: ReactNode }[];
  variant?: "cards" | "strip";
}) {
  if (variant === "cards") {
    return (
      <div className="grid shrink-0 gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <Card className="gap-1 py-3" key={item.label} size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">
              {item.value}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid shrink-0 divide-x divide-border border-b border-border bg-muted/35"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <div className="px-4 py-2.5 sm:px-6" key={item.label}>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <div className="mt-0.5 text-sm font-semibold">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-0 flex-1 overflow-auto p-3"
      data-slot="finance-table-frame"
    >
      {children}
    </div>
  );
}
function Th({
  align = "left",
  children,
}: {
  align?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <TableHead
      className={cn(
        "border-b border-border bg-muted/65 px-3 py-2 text-xs font-semibold text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </TableHead>
  );
}
function Td({
  align = "left",
  children,
  className,
}: {
  align?: "left" | "right";
  children: ReactNode;
  className?: string;
}) {
  return (
    <TableCell
      className={cn(
        "px-3 py-2.5 align-middle",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </TableCell>
  );
}
function Money({ amount }: { amount: number }) {
  return <MoneyDisplay align="right" value={formatMoneyDisplay(amount)} />;
}
function StatusBadge({ status }: { status: string }) {
  const label =
    status === "partly_paid"
      ? "Partly paid"
      : status === "paid"
        ? "Paid"
        : status === "voided"
          ? "Voided"
          : "Unpaid";
  return (
    <Badge
      tone={
        status === "paid"
          ? "success"
          : status === "partly_paid"
            ? "warning"
            : status === "voided"
              ? "neutral"
              : "danger"
      }
    >
      {label}
    </Badge>
  );
}
function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
function Checkbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <CheckboxPrimitive
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      {label}
    </label>
  );
}
function FormFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
      {children}
    </div>
  );
}
function SubmitButton({
  disabled,
  label,
}: {
  disabled?: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={disabled || pending} type="submit" variant="default">
      {pending ? "Saving…" : label}
    </Button>
  );
}
function ActionMessage({ state }: { state: FinanceOperationsActionState }) {
  return state.status === "error" && state.message ? (
    <p
      className="rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger"
      role="alert"
    >
      {state.message}
    </p>
  ) : null;
}
function DefinitionRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="overflow-hidden rounded-md border border-border">
      {rows.map(([label, value]) => (
        <div
          className="grid grid-cols-[minmax(120px,0.4fr)_1fr] gap-3 border-b border-border px-3 py-2 last:border-b-0"
          key={label}
        >
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function StepIndicator({
  current,
  labels,
}: {
  current: number;
  labels: string[];
}) {
  return (
    <ol className="flex items-center gap-2 border-b border-border pb-3">
      {labels.map((label, index) => {
        const number = index + 1;
        return (
          <li
            aria-current={number === current ? "step" : undefined}
            aria-label={`Step ${number} of ${labels.length}: ${label}`}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 text-xs",
              number === current
                ? "font-semibold text-foreground"
                : number < current
                  ? "text-success"
                  : "text-muted-foreground",
            )}
            key={label}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full border",
                number < current && "border-success bg-success-soft",
              )}
            >
              {number < current ? <Check size={12} /> : number}
            </span>
            <span className="truncate">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
