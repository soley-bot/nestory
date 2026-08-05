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
import { NumberInput } from "@/components/ui/number-input";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceWorkspaceNavigation } from "@/features/finance/components/finance-workspace-navigation";
import {
  confirmOwnerCollectionAction,
  generateTenantInvoiceAction,
  recordIpsExpenseAction,
  recordOwnerPaymentAction,
  recordTenantInvoicePaymentAction,
  recordWithdrawalAction,
  saveLeaseBillingAction,
} from "@/features/finance-operations/actions";
import type {
  FinanceLease,
  FinanceOperationsActionState,
  FinanceOperationsData,
  OwnerInvoiceSummary,
  PropertyFinancePosition,
  TenantInvoiceSummary,
} from "@/features/finance-operations/finance-operations.types";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";
import { formatMoneyDisplay } from "@/lib/money/format";
import { cn } from "@/lib/utils";

export type FinanceOperationsView =
  "account" | "balances" | "expenses" | "rent" | "work";

type ModalState =
  | { lease: FinanceLease; mode: "generate" }
  | {
      canChooseAnother?: boolean;
      invoice?: TenantInvoiceSummary;
      mode: "payment";
    }
  | { invoice: OwnerInvoiceSummary; mode: "owner-payment" }
  | { mode: "withdrawal"; position: PropertyFinancePosition };

type DrawerState =
  | { lease: FinanceLease; mode: "billing" }
  | {
      initialInvoiceId?: string;
      initialResponsibility?: "owner" | "tenant";
      mode: "expense";
    };

type FinanceOperationsScreenProps = FinanceOperationsData & {
  organizationName: string;
  selectedPropertyId?: string | null;
  view: FinanceOperationsView;
};

const actionInitialState: FinanceOperationsActionState = {};

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

  return (
    <WorkspacePage
      actions={screen.actions}
      context={screen.context}
      contextHref={screen.contextHref}
      headerClassName="py-3 lg:py-3"
      localNav={<FinanceWorkspaceNavigation activeRoute={screen.activeRoute} />}
      title={screen.title}
      toolbar={screen.toolbar}
    >
      <div className="flex h-full min-h-0 flex-col">
        {statusMessage ? (
          <div className="shrink-0 border-b border-border bg-surface px-4 py-2 sm:px-6">
            <p className="text-sm" role="status">
              {statusMessage}
            </p>
          </div>
        ) : null}
        {screen.body}
      </div>

      {drawer ? (
        <SideDrawer onClose={closeDrawer} open title={getDrawerTitle(drawer)}>
          {drawer.mode === "billing" ? (
            <BillingSetupForm
              lease={drawer.lease}
              onSuccess={onActionSuccess}
              organizationName={organizationName}
              peopleOptions={props.peopleOptions}
            />
          ) : (
            <ExpenseForm
              initialInvoiceId={drawer.initialInvoiceId}
              initialResponsibility={drawer.initialResponsibility}
              invoices={props.tenantInvoices}
              onSuccess={onActionSuccess}
              propertyOptions={props.propertyOptions}
              unitOptions={props.unitOptions}
            />
          )}
        </SideDrawer>
      ) : null}

      {modal ? (
        <Modal onClose={closeModal} open title={getModalTitle(modal)}>
          {modal.mode === "generate" ? (
            <GenerateInvoiceForm
              lease={modal.lease}
              onSuccess={onActionSuccess}
            />
          ) : modal.mode === "payment" ? (
            modal.invoice ? (
              <SettleInvoiceForm
                invoice={modal.invoice}
                onChooseAnother={
                  modal.canChooseAnother
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
          ) : modal.mode === "owner-payment" ? (
            <OwnerPaymentForm
              invoice={modal.invoice}
              onSuccess={onActionSuccess}
            />
          ) : (
            <WithdrawalForm
              onSuccess={onActionSuccess}
              position={modal.position}
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
  if (props.view === "rent") {
    return {
      activeRoute: "/rent-income" as const,
      actions: (
        <>
          <Button
            onClick={() => openModal({ mode: "payment" })}
            variant="primary"
          >
            <WalletCards size={15} /> Record payment
          </Button>
          <Button
            onClick={() =>
              openDrawer({ initialResponsibility: "tenant", mode: "expense" })
            }
          >
            <Plus size={15} /> Add charge
          </Button>
        </>
      ),
      body: (
        <RentView
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
      actions: (
        <Button
          onClick={() => openDrawer({ mode: "expense" })}
          variant="primary"
        >
          <Plus size={15} /> Add expense
        </Button>
      ),
      body: <ExpensesView expenses={props.expenses} />,
      context: `${props.expenses.length} expenses`,
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
          invoices={props.tenantInvoices}
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
        position && position.availableWithdrawal > 0 ? (
          <Button
            onClick={() => openModal({ mode: "withdrawal", position })}
            variant="primary"
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
    actions: (
      <Button onClick={() => openModal({ mode: "payment" })} variant="primary">
        <WalletCards size={15} /> Record payment
      </Button>
    ),
    body: (
      <FinanceWorkView
        leases={props.leases}
        openDrawer={openDrawer}
        openModal={openModal}
        ownerInvoices={props.ownerInvoices}
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
  leases,
  openDrawer,
  openModal,
  ownerInvoices,
  tenantInvoices,
}: {
  leases: FinanceLease[];
  openDrawer: (drawer: DrawerState) => void;
  openModal: (modal: ModalState) => void;
  ownerInvoices: OwnerInvoiceSummary[];
  tenantInvoices: TenantInvoiceSummary[];
}) {
  const leasesNeedingSetup = leases.filter((lease) => !lease.billing);
  const readyWithoutInvoice = leases.filter(
    (lease) =>
      lease.billing &&
      !tenantInvoices.some((invoice) => invoice.leaseId === lease.id),
  );
  const tenantDue = tenantInvoices.filter((invoice) => invoice.balanceDue > 0);
  const ownerDue = ownerInvoices.filter((invoice) => invoice.balanceDue > 0);
  const workCount =
    leasesNeedingSetup.length +
    readyWithoutInvoice.length +
    tenantDue.length +
    ownerDue.length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:px-6 sm:py-4">
      <CompactTotals
        variant="cards"
        items={[
          { label: "Needs setup", value: leasesNeedingSetup.length },
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
              <thead>
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
                      <Button
                        onClick={() => openDrawer({ lease, mode: "billing" })}
                      >
                        Set up
                      </Button>
                    </Td>
                  </tr>
                ))}
                {readyWithoutInvoice.map((lease) => (
                  <tr
                    className="border-b border-border"
                    key={`invoice-${lease.id}`}
                  >
                    <Td>
                      <p className="font-medium">Create rent invoice</p>
                      <p className="text-xs text-muted-foreground">
                        {lease.tenantLabel} · {lease.unitLabel}
                      </p>
                    </Td>
                    <Td>{lease.propertyLabel}</Td>
                    <Td>
                      <Money amount={lease.monthlyRent} />
                    </Td>
                    <Td>This month</Td>
                    <Td align="right">
                      <Button
                        onClick={() => openModal({ lease, mode: "generate" })}
                      >
                        Create
                      </Button>
                    </Td>
                  </tr>
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
                      <Button
                        onClick={() => openModal({ invoice, mode: "payment" })}
                      >
                        {invoice.collectionRoute === "through_ips"
                          ? "Record"
                          : "Confirm"}
                      </Button>
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
                      <Button
                        onClick={() =>
                          openModal({ invoice, mode: "owner-payment" })
                        }
                      >
                        Record
                      </Button>
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

function RentView({
  invoices,
  openModal,
  organizationName,
}: {
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
            body="Set up an active lease, then create its first rent invoice."
            className="flex-1"
            kind="empty"
            title="No rent invoices"
          />
        ) : (
          <TableFrame>
            <Table className="min-w-[980px]">
              <thead>
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
                      {invoice.balanceDue > 0 ? (
                        <Button
                          onClick={() =>
                            openModal({ invoice, mode: "payment" })
                          }
                        >
                          {invoice.collectionRoute === "through_ips"
                            ? "Record payment"
                            : "Confirm collected"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Done
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
  expenses,
}: {
  expenses: FinanceOperationsData["expenses"];
}) {
  return expenses.length === 0 ? (
    <EmptyState
      body="Record a property cost and choose whether the owner or tenant is responsible."
      className="h-full"
      kind="empty"
      title="No expenses"
    />
  ) : (
    <TableFrame>
      <Table className="min-w-[980px]">
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Expense</Th>
            <Th>Property</Th>
            <Th>Charged to</Th>
            <Th>Paid</Th>
            <Th>Billed</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => (
            <tr className="border-b border-border" key={expense.id}>
              <Td>{formatDate(expense.date)}</Td>
              <Td>
                <p className="font-medium">{expense.customerLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {expense.vendorLabel}
                </p>
              </Td>
              <Td>
                <p>{expense.propertyLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {expense.unitLabel}
                </p>
              </Td>
              <Td>
                <Badge
                  tone={
                    expense.responsibility === "owner" ? "accent" : "neutral"
                  }
                >
                  {expense.responsibility === "owner"
                    ? "Property owner"
                    : "Tenant or company"}
                </Badge>
                <p className="mt-1 text-xs text-muted-foreground">
                  {expense.responsibleLabel}
                </p>
              </Td>
              <Td>
                <Money amount={expense.internalCost} />
              </Td>
              <Td>
                <Money amount={expense.customerTotal} />
              </Td>
              <Td>
                {expense.responsibility === "tenant" ? (
                  "Added to invoice"
                ) : expense.ipsAdvanceAmount > 0 ? (
                  <span className="text-warning">
                    Owner owes <Money amount={expense.ipsAdvanceAmount} />
                  </span>
                ) : (
                  "Deducted from owner funds"
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
  invoices,
  openModal,
  ownerInvoices,
  positions,
}: {
  invoices: TenantInvoiceSummary[];
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
    <Tabs
      className="h-full min-h-0 gap-0 bg-background"
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
      <TabsContent className="min-h-0 overflow-auto" value="owners">
        <TableFrame>
          <Table className="min-w-[1040px]">
            <thead>
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
                        {ownerInvoice ? (
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
                        {position.availableWithdrawal > 0 ? (
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
      <TabsContent className="min-h-0 overflow-auto" value="tenants">
        <TableFrame>
          <Table className="min-w-[720px]">
            <thead>
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
    <div className="flex h-full min-h-0 flex-col bg-surface">
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
            <thead>
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
            variant="primary"
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

function GenerateInvoiceForm({
  lease,
  onSuccess,
}: {
  lease: FinanceLease;
  onSuccess: (message: string) => void;
}) {
  const idempotencyKey = useStableActionId("invoice");
  const [state, action] = useActionState(
    generateTenantInvoiceAction,
    actionInitialState,
  );
  const today = getBusinessDateValue();
  useSuccess(state, onSuccess);
  return (
    <form action={action} className="space-y-4 p-4">
      <DefinitionRows
        rows={[
          ["Lease", `${lease.tenantLabel} · ${lease.unitLabel}`],
          ["Property", lease.propertyLabel],
          ["Rent", formatMoneyDisplay(lease.monthlyRent).primary],
        ]}
      />
      <input name="leaseId" type="hidden" value={lease.id} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Billing month">
          <Input
            defaultValue={`${today.slice(0, 7)}-01`}
            name="billingPeriodStart"
            required
            type="date"
          />
        </Field>
        <Field label="Issue date">
          <DatePickerField defaultValue={today} name="issueDate" required />
        </Field>
      </div>
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton label="Create invoice" />
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
  unitOptions,
}: {
  initialInvoiceId?: string;
  initialResponsibility?: "owner" | "tenant";
  invoices: TenantInvoiceSummary[];
  onSuccess: (message: string) => void;
  propertyOptions: FinanceOperationsData["propertyOptions"];
  unitOptions: FinanceOperationsData["unitOptions"];
}) {
  const idempotencyKey = useStableActionId("expense");
  const initialInvoice = invoices.find(
    (invoice) => invoice.id === initialInvoiceId,
  );
  const [state, action] = useActionState(
    recordIpsExpenseAction,
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
  const [responsibility, setResponsibility] = useState<"owner" | "tenant">(
    initialResponsibility ?? "owner",
  );
  const [tenantInvoiceId, setTenantInvoiceId] = useState(
    initialInvoiceId ?? "",
  );
  const effectiveResponsibility =
    responsibility === "tenant" ? "tenant" : "owner";
  const matchingInvoices = invoices.filter(
    (invoice) => invoice.propertyId === propertyId && invoice.balanceDue > 0,
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
            onValueChange={setUnitId}
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
              onValueChange={setTenantInvoiceId}
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

      <Field label="Receipt or reference">
        <Input
          onChange={(event) => setReference(event.target.value)}
          placeholder="Optional"
          value={reference}
        />
      </Field>
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton
          disabled={
            !propertyId ||
            !vendor ||
            Number(cost) <= 0 ||
            (effectiveResponsibility === "tenant" && !tenantInvoiceId)
          }
          label={
            effectiveResponsibility === "tenant"
              ? "Add to invoice"
              : "Save owner expense"
          }
        />
      </FormFooter>
    </form>
  );
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
          <Input name="reference" placeholder="Bank transfer or note" />
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
  if (modal.mode === "generate") return "Create rent invoice";
  if (modal.mode === "payment")
    return !modal.invoice || modal.invoice.collectionRoute === "through_ips"
      ? "Record payment"
      : "Confirm owner collection";
  if (modal.mode === "owner-payment") return "Owner payment";
  return "Owner withdrawal";
}
function getDrawerTitle(drawer: DrawerState) {
  return drawer.mode === "billing" ? "Set up lease billing" : "Add expense";
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
      className="grid shrink-0 divide-x divide-border border-b border-border bg-surface-muted/35"
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
        "border-b border-border bg-surface-muted/65 px-3 py-2 text-xs font-semibold text-muted-foreground",
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
    <Button disabled={disabled || pending} type="submit" variant="primary">
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
