"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildLeaseRecordHref } from "@/features/leases/lease-detail-route";
import { matchesSearchText } from "@/lib/search/text";
import type { CurrentLeaseRentStatus, FinanceLease, FinanceOperationsData, RentUnitTarget } from "../finance-operations.types";

const STATUS_LABEL: Record<CurrentLeaseRentStatus["status"], string> = {
  posted: "Rent posted",
  voided: "Voided · review invoice",
  missing: "Rent to generate",
  setup_needed: "Billing setup needed",
  unknown: "Rent status unavailable",
};
type UnitRentFilter = "all" | "missing" | "setup_needed";

function unitRentFilter(value: string | null): UnitRentFilter {
  return value === "missing" || value === "setup_needed" ? value : "all";
}

export function RentUnitList({
  canGenerateRent,
  canViewLeases,
  currentRentStatuses,
  leases,
  manualRent,
  onChooseLease,
  onViewInvoice,
  properties,
  rentUnitTargets,
  units,
}: {
  canGenerateRent: boolean;
  canViewLeases: boolean;
  currentRentStatuses?: CurrentLeaseRentStatus[];
  leases: FinanceLease[];
  manualRent: boolean;
  onChooseLease: (leases: FinanceLease[]) => void;
  onViewInvoice: (invoiceId: string) => boolean;
  properties: FinanceOperationsData["propertyOptions"];
  rentUnitTargets?: RentUnitTarget[];
  units: FinanceOperationsData["unitOptions"];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("unitSearch") ?? "");
  const [filter, setFilter] = useState(() => unitRentFilter(searchParams.get("unitRentStatus")));
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
  const matchingRows = rows.filter(row => matchesSearchText(query, [row.label, row.propertyLabel, ...row.targets.map(target => target.tenantLabel)]));
  const filtered = filter === "all" ? matchingRows : matchingRows.filter(row => row.targets.some(target => statusByLease.get(target.id)?.status === filter));
  const setupCount = matchingRows.filter(row => row.targets.some(target => statusByLease.get(target.id)?.status === "setup_needed")).length;
  function listParams(preserve: boolean) {
    const params = new URLSearchParams(preserve ? searchParams.toString() : "");
    params.delete("invoiceId");
    if (query.trim()) params.set("unitSearch", query.trim());
    else params.delete("unitSearch");
    if (filter !== "all") params.set("unitRentStatus", filter);
    else params.delete("unitRentStatus");
    return params;
  }
  function invoiceHref(id: string, propertyId: string) {
    const params = listParams(pathname === "/rent-income");
    params.set("invoiceId", id);
    if (pathname !== "/rent-income") params.set("property", propertyId);
    return `/rent-income?${params}`;
  }

  return <section aria-label="Units for rent" className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="font-medium">Units for rent</h2>
        <p className="text-xs text-muted-foreground">{filter === "setup_needed"
          ? "Review the lease terms and billing rule for each unit."
          : manualRent && canGenerateRent ? "Choose a unit with rent to generate." : "Browse units and current rent status."}</p>
      </div>
      <span aria-live="polite" className="text-xs text-muted-foreground">{filtered.length} of {rows.length} units and whole-property leases</span>
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
      <label className="flex items-center gap-2 text-sm">Rent status
        <select aria-label="Unit rent status" className="h-9 rounded-md border border-input bg-card px-2 focus-visible:outline-2 focus-visible:outline-ring"
          value={filter} onChange={event => { setFilter(unitRentFilter(event.target.value)); setVisibleCount(40); }}>
          <option value="all">All rent statuses</option>
          <option value="missing">Rent to generate</option>
          <option value="setup_needed">Billing setup needed ({setupCount})</option>
        </select>
      </label>
    </div>
    {filtered.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{!matchingRows.length ? "No matching units." : filter === "setup_needed" ? "No matching units need billing setup." : "No units marked as rent to generate."}</p> :
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
              <div className="flex flex-wrap gap-x-3">{row.targets.map(target => {
                const status = statusByLease.get(target.id);
                if (status?.status === "setup_needed" && !leaseById.has(target.id)) {
                  return <span className="text-xs text-muted-foreground" key={target.id}>Check the signed lease for {target.tenantLabel}. No confirmed term is available.</span>;
                }
                if (status?.status === "setup_needed" && canViewLeases) {
                  const href = buildLeaseRecordHref({ leaseId: target.id, section: "rent", returnTo: `${pathname}?${listParams(true)}` });
                  return <Link className="text-xs text-primary underline underline-offset-2" href={href} key={target.id}>Review {target.tenantLabel}&apos;s lease</Link>;
                }
                const id = status?.invoiceId;
                if (!id || (status.status !== "posted" && status.status !== "voided") || !/^[0-9a-f-]{36}$/i.test(id)) return null;
                return <Link className="text-xs text-primary underline-offset-2 hover:underline" href={invoiceHref(id, target.propertyId)} key={target.id}
                  onNavigate={event => { if (onViewInvoice(id)) event.preventDefault(); }}>View {target.tenantLabel}&apos;s invoice</Link>;
              })}</div>
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
