import Link from "next/link";
import {
  Archive,
  Building2,
  ExternalLink,
  Home,
  MapPin,
  Pencil,
  RotateCcw,
  UserRound,
} from "lucide-react";
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
      <aside className="rounded-md border border-border bg-surface p-5 2xl:sticky 2xl:top-5">
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
    <aside className="rounded-md border border-border bg-surface 2xl:sticky 2xl:top-5 2xl:max-h-[calc(100vh-170px)] 2xl:overflow-auto">
      <div className="border-b border-border p-4">
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

      <div className="space-y-4 p-4">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Detail icon={<Home size={14} />} label="Units" value={property.unitSummary} />
          <Detail icon={<UserRound size={14} />} label="Owner" value={property.owner} />
          <Detail icon={<MapPin size={14} />} label="Address" value={property.address} wide />
          <Detail label="Net income" wide>
            <MoneyDisplay value={property.netIncome} />
          </Detail>
        </dl>

        <div className="grid grid-cols-3 gap-2 text-sm">
          <Link
            aria-label={`Open ${property.name}`}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border font-medium text-foreground transition-colors hover:bg-surface-muted"
            href={`/properties/${property.id}`}
            prefetch={false}
            title="Open property"
          >
            <ExternalLink size={15} />
          </Link>
          {property.isArchived ? (
            <Button
              aria-label={`Restore ${property.name}`}
              className="px-0"
              onClick={() => onRestoreProperty(property)}
              title="Restore property"
              variant="primary"
            >
              <RotateCcw size={15} />
            </Button>
          ) : (
            <Button
              aria-label={`Edit ${property.name}`}
              className="px-0"
              onClick={() => onEditProperty(property)}
              title="Edit property"
            >
              <Pencil size={15} />
            </Button>
          )}
          {!property.isArchived ? (
            <Button
              aria-label={`Archive ${property.name}`}
              className="px-0 text-danger hover:text-danger"
              onClick={() => onArchiveProperty(property)}
              title="Archive property"
              variant="ghost"
            >
              <Archive size={15} />
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>
      </div>
    </aside>
  );
}

function Detail({
  children,
  icon,
  label,
  value,
  wide = false,
}: {
  children?: React.ReactNode;
  icon?: React.ReactNode;
  label: string;
  value?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {icon ? <span>{icon}</span> : null}
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">{children ?? value}</dd>
    </div>
  );
}
