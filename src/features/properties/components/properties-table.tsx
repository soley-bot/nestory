import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { PropertySummary } from "@/features/properties/data/properties";

export function PropertiesTable({
  properties,
}: {
  properties: PropertySummary[];
}) {
  return (
    <div className="rounded-md border border-border bg-surface">
      <table className="w-full border-collapse text-left text-sm">
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
                  className="font-medium text-accent hover:underline"
                  href={`/properties/${property.id}`}
                >
                  {property.name}
                </Link>
                <p className="mt-1 text-xs text-muted">
                  {property.code} / {property.type}
                </p>
              </td>
              <td className="px-4 py-3">{property.owner}</td>
              <td className="px-4 py-3 text-muted">{property.address}</td>
              <td className="px-4 py-3">
                <Badge tone={property.status === "Active" ? "success" : "warning"}>
                  {property.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                {property.occupiedUnits}/{property.units}
              </td>
              <td className="px-4 py-3 text-right font-medium">
                {property.netIncome}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
