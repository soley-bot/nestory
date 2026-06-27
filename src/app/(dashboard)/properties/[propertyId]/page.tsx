import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { MoneyDisplay } from "@/components/data/money-display";
import { PropertyUnitsTable } from "@/features/properties/components/property-units-table";
import { getPropertyDetail } from "@/features/properties/data/properties";
import { getOrganizationCurrencySettings } from "@/features/settings/data/settings";
import { requireAdminContext } from "@/lib/auth/context";
import type { MoneyDisplayValue } from "@/lib/money/format";

type PropertyPageProps = {
  params: Promise<{ propertyId: string }>;
};

export default async function PropertyPage({ params }: PropertyPageProps) {
  const { propertyId } = await params;
  const context = await requireAdminContext();
  const currencySettings = await getOrganizationCurrencySettings(
    context.organizationId,
  );
  const property = await getPropertyDetail(
    context.organizationId,
    propertyId,
    currencySettings,
  );

  if (!property) {
    notFound();
  }

  return (
    <div>
      <PageHeader
        description={`${property.code} / ${property.type} / ${property.address}`}
        title={property.name}
      />
      <div className="px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-md border border-border bg-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Property summary</h2>
                <p className="mt-1 text-sm text-muted">
                  Property-level record for {property.code}.
                </p>
              </div>
              <Badge tone={property.status === "Active" ? "success" : "warning"}>
                {property.status}
              </Badge>
            </div>
            <dl className="mt-4 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Code" value={property.code} />
              <Detail label="Type" value={property.type} />
              <Detail label="Owner" value={property.owner} />
              <Detail label="Units" value={property.unitSummary} />
              <Detail label="Net income" moneyValue={property.netIncome} />
              <Detail label="Address" value={property.address} wide />
            </dl>
          </section>

          <aside className="rounded-md border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold">Attached units</h2>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm xl:grid-cols-1">
              <Detail label="Active" value={String(property.activeUnitCount)} />
              <Detail label="Archived" value={String(property.archivedUnitCount)} />
              <Detail label="Total" value={String(property.totalUnitCount)} />
            </dl>
          </aside>
        </div>

        <section className="mt-4 space-y-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Units</h2>
              <p className="text-sm text-muted">
                {property.totalUnitCount === 0
                  ? "No units recorded."
                  : `${property.totalUnitCount} unit records.`}
              </p>
            </div>
          </div>

          {property.unitsList.length === 0 ? (
            <div className="rounded-md border border-border bg-surface px-4 py-8 text-sm text-muted">
              Property-only record. There are no units attached.
            </div>
          ) : (
            <PropertyUnitsTable units={property.unitsList} />
          )}
        </section>
      </div>
    </div>
  );
}

function Detail({
  label,
  moneyValue,
  value,
  wide = false,
}: {
  label: string;
  moneyValue?: MoneyDisplayValue;
  value?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "min-w-0 sm:col-span-2 lg:col-span-3" : "min-w-0"}>
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">
        {moneyValue ? <MoneyDisplay value={moneyValue} /> : value}
      </dd>
    </div>
  );
}
