import Link from "next/link";
import { Archive, Building2, ExternalLink, Pencil, RotateCcw } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PropertySummary } from "@/features/properties/data/properties";

type PropertyInspectorProps = {
  onArchiveProperty: (property: PropertySummary) => void;
  onEditProperty: (property: PropertySummary) => void;
  onRestoreProperty: (property: PropertySummary) => void;
  property: PropertySummary | null;
};

export function PropertyInspector({
  onArchiveProperty,
  onEditProperty,
  onRestoreProperty,
  property,
}: PropertyInspectorProps) {
  if (!property) {
    return (
      <aside className="rounded-md border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <Building2 className="text-muted" size={16} />
          <h2 className="text-base font-semibold">Property inspector</h2>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted">
          Select a property row to inspect ownership, occupancy, and linked record
          context.
        </p>
      </aside>
    );
  }

  return (
    <aside className="rounded-md border border-border bg-surface">
      <div className="border-b border-border p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
              {property.code}
            </p>
            <h2 className="mt-1 break-words text-base font-semibold">
              {property.name}
            </h2>
            <p className="mt-1 break-words text-sm text-muted">{property.type}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={property.statusTone}>{property.status}</Badge>
            {property.isArchived ? <Badge tone="warning">Archived</Badge> : null}
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Detail label="Units" value={property.unitSummary} />
          <Detail label="Owner" value={property.owner} />
          <Detail label="Address" value={property.address} wide />
          <Detail label="Net income" wide>
            <MoneyDisplay value={property.netIncome} />
          </Detail>
        </dl>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <Link
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 font-medium text-foreground transition-colors hover:bg-surface-muted"
            href={`/properties/${property.id}`}
            prefetch={false}
          >
            <ExternalLink size={15} />
            Open
          </Link>
          {property.isArchived ? (
            <Button onClick={() => onRestoreProperty(property)} variant="primary">
              <RotateCcw size={15} />
              Restore
            </Button>
          ) : (
            <Button onClick={() => onEditProperty(property)}>
              <Pencil size={15} />
              Edit
            </Button>
          )}
        </div>

        {!property.isArchived ? (
          <Button
            className="w-full text-danger hover:text-danger"
            onClick={() => onArchiveProperty(property)}
            variant="ghost"
          >
            <Archive size={15} />
            Archive property
          </Button>
        ) : null}
      </div>
    </aside>
  );
}

function Detail({
  children,
  label,
  value,
  wide = false,
}: {
  children?: React.ReactNode;
  label: string;
  value?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">{children ?? value}</dd>
    </div>
  );
}
