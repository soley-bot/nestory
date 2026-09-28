from pathlib import Path

path = Path("src/features/finance-operations/components/finance-operations-screen.tsx")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    '''import {
  getRentInvoiceView,
  RentInvoiceFilterBar,
} from "@/features/finance-operations/components/rent-invoice-filters";''',
    '''import {
  getRentInvoiceView,
  isVisibleTenantInvoice,
  RentInvoiceFilterBar,
} from "@/features/finance-operations/components/rent-invoice-filters";''',
    "rent filter import",
)

replace_once(
    '''import { FinanceCategorySetupEntry } from "@/features/finance-operations/components/finance-category-manager";''',
    '''import { FinanceCategorySetupEntry } from "@/features/finance-operations/components/finance-category-manager";
import { TenantInvoiceVoidControl } from "@/features/finance-operations/components/tenant-invoice-void-control";''',
    "void control import",
)

replace_once(
    '''              onRecordPayment={() =>
                setModal({
                  invoice: visibleDetailDrawer.invoice,
                  mode: "payment",
                })
              }
              onPublishPdf={(trigger) => {''',
    '''              onRecordPayment={() =>
                setModal({
                  invoice: visibleDetailDrawer.invoice,
                  mode: "payment",
                })
              }
              onVoidSuccess={onActionSuccess}
              onPublishPdf={(trigger) => {''',
    "invoice details success callback",
)

replace_once(
    '''    const invoices = props.initialRentLeaseId
      ? props.tenantInvoices.filter(
          (invoice) => invoice.leaseId === props.initialRentLeaseId,
        )
      : props.tenantInvoices;''',
    '''    const invoices = (
      props.initialRentLeaseId
        ? props.tenantInvoices.filter(
            (invoice) => invoice.leaseId === props.initialRentLeaseId,
          )
        : props.tenantInvoices
    ).filter(isVisibleTenantInvoice);''',
    "daily rent invoice filtering",
)

replace_once(
    '''          invoices={props.tenantInvoices}
          openingAuthority={props.openingAuthority}''',
    '''          invoices={props.tenantInvoices.filter(isVisibleTenantInvoice)}
          openingAuthority={props.openingAuthority}''',
    "tenant balance filtering",
)

replace_once(
    '''        tenantInvoices={props.tenantInvoices}
      />''',
    '''        tenantInvoices={props.tenantInvoices.filter(isVisibleTenantInvoice)}
      />''',
    "finance work filtering",
)

replace_once(
    '''function InvoiceDetails({
  canCorrectFinance,
  canRecordPayments,
  invoice,
  onCorrect,
  onPublicationClose,
  onPublicationSuccess,
  onPublishPdf,
  onRecordPayment,
  organizationName,''',
    '''function InvoiceDetails({
  canCorrectFinance,
  canRecordPayments,
  invoice,
  onCorrect,
  onPublicationClose,
  onPublicationSuccess,
  onPublishPdf,
  onRecordPayment,
  onVoidSuccess,
  organizationName,''',
    "invoice details prop destructuring",
)

replace_once(
    '''  onPublishPdf: (trigger: HTMLElement) => void;
  onRecordPayment: () => void;
  organizationName: string;''',
    '''  onPublishPdf: (trigger: HTMLElement) => void;
  onRecordPayment: () => void;
  onVoidSuccess: (message: string) => void;
  organizationName: string;''',
    "invoice details prop type",
)

replace_once(
    '''      <FormFooter>
        <span />
        <div className="flex flex-wrap justify-end gap-2">
          {canCorrect ? (
            <Button onClick={onCorrect} variant="outline">''',
    '''      <FormFooter>
        <span />
        <div className="flex flex-wrap justify-end gap-2">
          <TenantInvoiceVoidControl
            canCorrectFinance={canCorrectFinance}
            invoice={invoice}
            onSuccess={onVoidSuccess}
          />
          {canCorrect ? (
            <Button onClick={onCorrect} variant="outline">''',
    "invoice details void action",
)

path.write_text(text, encoding="utf-8")
