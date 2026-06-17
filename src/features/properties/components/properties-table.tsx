import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { PropertySummary } from "@/features/properties/data/properties";

export function PropertiesTable({
  properties,
}: {
  properties: PropertySummary[];
}) {
  return (
    <div>
      <div className="space-y-3 md:hidden">
        {properties.length === 0 ? (
          <p className="rounded-md border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            No active properties yet.
          </p>
        ) : null}
        {properties.map((property) => (
          <article
            className="rounded-md border border-border bg-surface p-4 text-sm"
            key={property.id}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  className="break-words font-medium text-accent hover:underline"
                  href={`/properties/${property.id}`}
                >
                  {property.name}
                </Link>
                <p className="mt-1 break-words text-xs text-muted">
                  {property.code} / {property.type}
                </p>
              </div>
              <Badge tone={property.status === "Active" ? "success" : "warning"}>
                {property.status}
              </Badge>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
                  Owner
                </dt>
                <dd className="mt-1 break-words font-medium">{property.owner}</dd>
              </div>
              <div className="min-w-0 text-right">
                <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
                  Occupancy
                </dt>
                <dd className="mt-1 font-medium">
                  {property.occupiedUnits}/{property.units}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
                  Address
                </dt>
                <dd className="mt-1 break-words text-muted">{property.address}</dd>
              </div>
              <div className="min-w-0 text-right">
                <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
                  Net income
                </dt>
                <dd className="mt-1 font-medium">{property.netIncome}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-md border border-border bg-surface md:block">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[180px]" />
            <col className="w-[140px]" />
            <col />
            <col className="w-[104px]" />
            <col className="w-[112px]" />
            <col className="w-[128px]" />
          </colgroup>
          <thead className="bg-surface-muted text-xs uppercase tracking-[0.06em] text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Property</th>
              <th className="px-4 py-3 font-semibold">Owner</th>
              <th className="px-4 py-3 font-semibold">Address</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Occupancy</th>
              <th className="px-4 py-3 text-right font-semibold">Net income</th>
            </tr>
          </thead>
          <tbody>
            {properties.length === 0 ? (
              <tr className="border-t border-border">
                <td className="px-4 py-8 text-center text-muted" colSpan={6}>
                  No active properties yet.
                </td>
              </tr>
            ) : null}
            {properties.map((property) => (
              <tr className="border-t border-border" key={property.id}>
                <td className="px-4 py-3">
                  <Link
                    className="break-words font-medium text-accent hover:underline"
                    href={`/properties/${property.id}`}
                  >
                    {property.name}
                  </Link>
                  <p className="mt-1 break-words text-xs text-muted">
                    {property.code} / {property.type}
                  </p>
                </td>
                <td className="px-4 py-3 break-words">{property.owner}</td>
                <td className="px-4 py-3 break-words text-muted">
                  {property.address}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={property.status === "Active" ? "success" : "warning"}>
                    {property.status}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {property.occupiedUnits}/{property.units}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                  {property.netIncome}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
