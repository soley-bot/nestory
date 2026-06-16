import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { getPropertySummary } from "@/features/properties/data/properties";
import { requireAdminContext } from "@/lib/auth/context";

type PropertyPageProps = {
  params: Promise<{ propertyId: string }>;
};

export default async function PropertyPage({ params }: PropertyPageProps) {
  const { propertyId } = await params;
  const context = await requireAdminContext();
  const property = await getPropertySummary(context.organizationId, propertyId);

  if (!property) {
    notFound();
  }

  return (
    <div>
      <PageHeader
        description={`${property.code} / ${property.type} / ${property.address}`}
        title={property.name}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-5 p-8">
        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-base font-semibold">Property record</h2>
          <dl className="mt-5 grid grid-cols-2 gap-5 text-sm">
            <Detail label="Owner" value={property.owner} />
            <Detail label="Status" value={property.status} />
            <Detail label="Units" value={`${property.occupiedUnits}/${property.units}`} />
            <Detail label="Net income" value={property.netIncome} />
          </dl>
        </section>
        <aside className="rounded-md border border-border bg-surface p-5">
          <Badge tone={property.status === "Active" ? "success" : "warning"}>
            {property.status}
          </Badge>
          <p className="mt-4 text-sm leading-6 text-muted">
            This detail page will become the central hub for units, leases,
            ledger entries, documents, and timeline history.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
