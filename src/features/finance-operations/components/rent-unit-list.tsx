"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { matchesSearchText } from "@/lib/search/text";
import type { CurrentLeaseRentStatus, FinanceLease, FinanceOperationsData, RentUnitTarget } from "../finance-operations.types";

const STATUS_LABEL: Record<CurrentLeaseRentStatus["status"], string> = {
  posted: "Rent posted",
  voided: "Voided · review invoice",
  missing: "Rent to generate",
  setup_needed: "Billing setup needed",
  unknown: "Rent status unavailable",
};

export function RentUnitList({
  canGenerateRent,
  currentRentStatuses,
  leases,
  manualRent,
  onChooseLease,
  properties,
  rentUnitTargets,
  units,
}: {
  canGenerateRent: boolean;
  currentRentStatuses?: CurrentLeaseRentStatus[];
  leases: FinanceLease[];
  manualRent: boolean;
  onChooseLease: (leases: FinanceLease[]) => void;
  properties: FinanceOperationsData["propertyOptions"];
  rentUnitTargets?: RentUnitTarget[];
  units: FinanceOperationsData["unitOptions"];
}) {
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40);
  const targets = rentUnitTargets ?? leases.filter(lease => lease.status === "active" || lease.status === "notice_given")
    .map(lease => ({ id: lease.id, propertyId: lease.propertyId, unitId: lease.unitId, tenantLabel: lease.tenantLabel }));
  const leaseById = new Map(leases.map(lease => [lease.id, lease]));
  const statusByLease = new Map(currentRentStatuses?.map(status => [status.leaseId, status]));
  const propertyLabelById = new Map(properties.map(property => [property.id, property.label]));
  const targetsByUnit = new Map<string, RentUnitTarget[]>();
  for (const target of targets) {
    const key = target.unitId ?? `property:${target.propertyId}`;
    const matches = targetsByUnit.get(key) ?? [];
    matches.push(target);
    targetsByUnit.set(key, matches);
  }
  const rows = [
    ...units.map(unit => ({
      key: unit.id,
      label: unit.label,
      propertyLabel: propertyLabelById.get(unit.propertyId ?? "") ?? "Property",
      targets: targetsByUnit.get(unit.id) ?? [],
    })),
    ...properties.flatMap(property => {
      const propertyTargets = targetsByUnit.get(`property:${property.id}`) ?? [];
      return propertyTargets.length
        ? [{ key: `property:${property.id}`, label: "Whole property", propertyLabel: property.label, targets: propertyTargets }]
        : [];
    }),
  ].sort((left, right) => `${left.propertyLabel} ${left.label}`.localeCompare(`${right.propertyLabel} ${right.label}`));
  const filtered = rows.filter(row =>
    (!onlyMissing || row.targets.some(target => statusByLease.get(target.id)?.status === "missing")) &&
    matchesSearchText(query, [row.label, row.propertyLabel, ...row.targets.map(target => target.tenantLabel)]));

  return <section aria-label="Units for rent" className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="font-medium">Units for rent</h2>
        <p className="text-xs text-muted-foreground">{manualRent && canGenerateRent ? "Choose a unit with rent to generate." : "Browse units and current rent status."}</p>
      </div>
      <span className="text-xs text-muted-foreground">{filtered.length} of {rows.length} units and whole-property leases</span>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Input
        aria-label="Search units for rent"
        className="max-w-md"
        onChange={event => { setQuery(event.target.value); setVisibleCount(40); }}
        placeholder="Search property, code, unit or tenant"
        type="search"
        value={query}
      />
      <label className="flex items-center gap-2 text-sm">
        <input checked={onlyMissing} onChange={event => { setOnlyMissing(event.target.checked); setVisibleCount(40); }} type="checkbox" />
        Only show rent to generate
      </label>
    </div>
    {filtered.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No matching units.</p> :
      <ul className="mt-3 max-h-80 divide-y divide-border overflow-y-auto" data-slot="rent-unit-list">
        {filtered.slice(0, visibleCount).map(row => {
          const missingLeases = row.targets.filter(target => statusByLease.get(target.id)?.status === "missing")
            .flatMap(target => leaseById.get(target.id) ?? []);
          return <li className="flex flex-wrap items-center justify-between gap-2 py-2" key={row.key}>
            <div className="min-w-0">
              <p className="text-sm font-medium">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.propertyLabel} · {row.targets.length === 0 ? "No current lease" : row.targets.map(target => {
                const status = statusByLease.get(target.id);
                const label = STATUS_LABEL[status?.status ?? "unknown"];
                return `${target.tenantLabel}: ${label}${status?.billingPeriodStart ? ` (${status.billingPeriodStart.slice(0, 7)})` : ""}`;
              }).join(" · ")}</p>
              {row.targets.map(target => {
                const status = statusByLease.get(target.id);
                return status?.invoiceId && (status.status === "posted" || status.status === "voided") && /^[0-9a-f-]{36}$/i.test(status.invoiceId)
                  ? <Link className="text-xs text-primary underline-offset-2 hover:underline" href={`/rent-income?invoiceId=${status.invoiceId}`} key={target.id}>View {target.tenantLabel}&apos;s invoice</Link>
                  : null;
              })}
            </div>
            {manualRent && canGenerateRent && missingLeases.length > 0 ? <Button
              aria-label={`Generate rent invoice for ${row.label}`}
              onClick={() => onChooseLease(missingLeases)}
              size="sm"
              variant="outline"
            >Generate rent invoice</Button> : null}
          </li>;
        })}
      </ul>}
    {filtered.length > visibleCount ? <Button className="mt-3" onClick={() => setVisibleCount(count => count + 40)} size="sm" variant="outline">Show more units</Button> : null}
  </section>;
}
