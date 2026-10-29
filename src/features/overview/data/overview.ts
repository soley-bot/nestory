import type { OverviewSummary } from "./overview-summary.types";
import {
  resolveRecentChangeTargets,
  type ActivityTargetQueryClient,
} from "@/features/activity/recent-change-targets";
import type {
  OverviewAttentionItem,
  OverviewLedgerPoint,
  OverviewMetric,
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";
import { createSupabaseServerClient } from "@/lib/db/server";
import { withFinancialReadContext } from "@/lib/finance/financial-write-context.server";
import { readAllRows } from "@/lib/db/read-all-rows";
import { formatMoneyTotalsDisplay } from "@/lib/money/totals";

const largeExpenseReviewThreshold = 1000;
const largeExpenseReviewHref = `/ledger?direction=expense&sort=amount_desc&period=last_30_days&minAmount=${largeExpenseReviewThreshold}`;
const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
});

type LedgerWindowRow = OverviewSummary["ledger"][number];
type PersonRoleRow = { role: "owner" | "tenant" | "vendor" };

export async function getOverviewScreenData(
  organizationId: string,
  query?: OverviewViewQuery,
): Promise<OverviewScreenData> {
  const month = query?.month ?? getBusinessDateString(new Date()).slice(0, 7);
  return withFinancialReadContext(organizationId, async (context) => ({
    ...await loadOverviewScreenData(organizationId, query, context.financial_start_date),
    financialGeneration: context.generation,
  }), `${month}-01`);
}

async function loadOverviewScreenData(
  organizationId: string,
  query?: OverviewViewQuery,
  financialStartDate?: string | null,
): Promise<OverviewScreenData> {
  const supabase = await createSupabaseServerClient();
  const businessToday = getBusinessDateString(new Date());
  const month = query?.month ?? businessToday.slice(0, 7);
  const currentMonthStart = startOfMonth(`${month}-01`);
  const originalLedgerStart = addMonths(currentMonthStart, -5);
  const ledgerStart = financialStartDate && toDateInput(originalLedgerStart) < financialStartDate
    ? new Date(`${financialStartDate}T00:00:00.000Z`) : originalLedgerStart;
  const [summaryResult, propertiesResult, recentActivityResult] = await Promise.all([
    supabase.rpc("get_overview_summary", {
      p_organization_id: organizationId,
      p_property_id: query?.propertyId && query.propertyId !== "all" ? query.propertyId : undefined,
      p_today: businessToday,
      p_month: `${month}-01`,
      p_financial_start_date: financialStartDate ?? undefined,
    }),
    // The picker and property charts intentionally represent the whole visible portfolio.
    // Only these compact property labels scale with portfolio size; child rows do not.
    readAllRows((from, to) => supabase.from("properties")
      .select("id, code, name, rental_structure, status")
      .eq("organization_id", organizationId).is("archived_at", null).neq("status", "inactive")
      .order("code", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    supabase.from("activity_logs")
      .select("id, entity_type, entity_id, action, previous_values, new_values, created_at")
      .eq("organization_id", organizationId).order("created_at", { ascending: false })
      .order("id", { ascending: false }).limit(8),
  ]);
  assertNoError(summaryResult.error, "overview summary");
  assertNoError(propertiesResult.error, "overview properties");
  assertNoError(recentActivityResult.error, "overview activity");
  if (!summaryResult.data) throw new Error("Could not load overview summary: aggregate is missing.");
  const summary = summaryResult.data as unknown as OverviewSummary;
  const counts = summary.counts;
  const attentionItems = buildAttentionItems(counts);
  const occupancyByProperty = summary.properties.map(property => ({
    href: `/units?occupancy=unoccupied&propertyId=${property.id}`,
    label: `${property.code} / ${property.name}`,
    occupiedUnits: property.occupiedUnits,
    percent: property.totalUnits ? Math.round(property.occupiedUnits / property.totalUnits * 100) : 0,
    totalUnits: property.totalUnits,
    unoccupiedUnits: property.unoccupiedUnits,
    vacantUnits: property.vacantUnits,
  })).toSorted((a, b) => a.percent - b.percent || b.totalUnits - a.totalUnits || a.label.localeCompare(b.label));
  const maintenanceByProperty = summary.properties.filter(property => property.openCount > 0).map(property => ({
    blockedCount: property.blockedCount,
    cases: property.cases.map(task => ({ ...task, href: `/maintenance?taskId=${task.id}` })),
    href: `/maintenance?review=open&propertyId=${property.id}`,
    label: `${property.code} / ${property.name}`,
    openCount: property.openCount, overdueCount: property.overdueCount, urgentCount: property.urgentCount,
  })).toSorted((a, b) => b.overdueCount - a.overdueCount || b.urgentCount - a.urgentCount || b.openCount - a.openCount || a.label.localeCompare(b.label));
  const recordsByProperty = summary.properties.map(property => ({
    documentCount: property.documentCount, href: `/properties/${property.id}`,
    label: `${property.code} / ${property.name}`, missingTenantLinks: property.missingTenantLinks,
    ownerLinked: property.ownerLinked, unitCount: property.totalUnits,
  })).toSorted((a, b) => Number(a.ownerLinked) - Number(b.ownerLinked) || b.missingTenantLinks - a.missingTenantLinks || a.label.localeCompare(b.label));
  const recentChanges = await resolveRecentChangeTargets({
    logs: recentActivityResult.data ?? [], organizationId,
    supabase: supabase as unknown as ActivityTargetQueryClient,
  });
  return {
    attentionItems,
    attentionTotal: attentionItems.reduce((total, item) => total + item.count, 0),
    dashboardSummary: buildDashboardSummary({ ...counts, attentionItems }),
    expectedRent: { leaseCount: summary.expectedRent.leaseCount, monthly: summary.expectedRent.leaseCount
      ? formatMoneyTotalsDisplay([{ amount: summary.expectedRent.amount, currency: "USD" }]) : null },
    leaseEndings: Array.from({ length: 6 }, (_, index) => {
      const date = addMonths(currentMonthStart, index);
      const key = getMonthKey(date);
      return { count: summary.leaseEndings.find(point => point.month === key)?.count ?? 0,
        href: `/leases?status=current&endMonth=${key}&sort=end_asc`, label: monthLabelFormatter.format(date) };
    }),
    leaseRiskCount: counts.leasesEndingSoon,
    ledgerCurrency: "USD",
    ledgerFlow: buildLedgerFlowChart({ monthEnd: currentMonthStart, ledgerRows: summary.ledger, monthStart: ledgerStart }),
    maintenanceByProperty,
    metrics: buildMetrics({
      activeLeaseCount: counts.activeLeaseCount, attentionItems, leaseGapUnitCount: counts.leaseGapUnits,
      mtdLedgerRows: summary.ledger.filter(row => row.transaction_date.slice(0, 7) === month),
      occupancyRate: counts.unitCount ? `${Math.round(counts.occupiedUnits / counts.unitCount * 100)}%` : "0%",
      peopleCount: counts.peopleCount, roleCounts: new Map([["tenant", counts.tenantCount]]),
    }),
    occupancyByProperty,
    propertyOptions: (propertiesResult.data ?? []).map(property => ({ label: `${property.code} / ${property.name}`, value: property.id })),
    recordsByProperty,
    quickActions: [
      { href: "/import", label: "Import data" }, { href: "/properties?action=create", label: "Add property" },
      { href: "/units?action=create", label: "Add unit" }, { href: "/leases?action=create", label: "Add lease" },
      { href: "/people?action=create", label: "Add person" }, { href: "/timeline?action=create", label: "Add event" },
      { href: "/ledger?action=create", label: "Add ledger entry" },
    ],
    recentChanges,
    workspaceSetup: {
      activeLeaseCount: counts.activeLeaseCount,
      hasAnyOperatingData: summary.properties.length > 0 || counts.unitCount > 0 || counts.peopleCount > 0
        || counts.currentLeaseCount > 0 || counts.ledgerEntryCount > 0 || counts.openMaintenanceCount > 0,
      ledgerEntryCount: counts.ledgerEntryCount, peopleCount: counts.peopleCount,
      propertyCount: summary.properties.length, unitCount: counts.unitCount,
    },
  };
}

function buildDashboardSummary({
  attentionItems,
  largeRecentExpenseCount,
  leaseGapUnits,
  leasesEndingSoon,
  missingTenantLeases,
  missingOwnerLinks,
  peopleMissingContacts,
  peopleWithoutRoles,
  vacantUnits,
}: {
  attentionItems: OverviewAttentionItem[];
  largeRecentExpenseCount: number;
  leaseGapUnits: number;
  leasesEndingSoon: number;
  missingTenantLeases: number;
  missingOwnerLinks: number;
  peopleMissingContacts: number;
  peopleWithoutRoles: number;
  vacantUnits: number;
}) {
  const attentionTotal = attentionItems.reduce((total, item) => total + item.count, 0);

  if (peopleWithoutRoles > 0) {
    return {
      actionHref: "/people?status=no_role",
      actionLabel: "Review people",
      detail: `${peopleWithoutRoles} people need a tenant, owner, vendor, or staff role before workflow checks are reliable.`,
      headline: "People records need cleanup first.",
      tone: "danger" as const,
    };
  }

  if (vacantUnits > 0) {
    return {
      actionHref: "/units?status=vacant",
      actionLabel: "View vacant units",
      detail: "Review availability, attach new leases, or make the vacant-units report.",
      headline: `${vacantUnits} vacant units are available.`,
      tone: "warning" as const,
    };
  }

  if (leaseGapUnits > 0) {
    return {
      actionHref: "/units?leaseStatus=missing",
      actionLabel: "Review lease gaps",
      detail: "Some unit records have no current lease link.",
      headline: `${leaseGapUnits} units need lease record review.`,
      tone: "warning" as const,
    };
  }

  if (leasesEndingSoon > 0) {
    return {
      actionHref: "/leases?status=current&endsWithin=60d&sort=end_asc",
      actionLabel: "Review leases",
      detail: `${leasesEndingSoon} leases end in 60 days. Start renewal or move-out planning here.`,
      headline: "Lease renewals need attention.",
      tone: "warning" as const,
    };
  }

  if (missingTenantLeases > 0) {
    return {
      actionHref: "/leases?status=current&tenantStatus=missing",
      actionLabel: "Review tenant links",
      detail: `${missingTenantLeases} current leases are missing a linked People tenant.`,
      headline: "Lease tenant links need cleanup.",
      tone: "warning" as const,
    };
  }

  if (missingOwnerLinks > 0) {
    return {
      actionHref: "/properties?ownerStatus=missing",
      actionLabel: "Review missing owners",
      detail: `${missingOwnerLinks} properties are missing a current primary owner.`,
      headline: "Owner relationships need cleanup.",
      tone: "warning" as const,
    };
  }


  if (peopleMissingContacts > 0) {
    return {
      actionHref: "/people?status=missing_contact",
      actionLabel: "Review missing contacts",
      detail: `${peopleMissingContacts} people are missing usable contact information.`,
      headline: "Contact records need review.",
      tone: "warning" as const,
    };
  }

  if (largeRecentExpenseCount > 0) {
    return {
      actionHref: largeExpenseReviewHref,
      actionLabel: "Review expenses",
      detail: `${largeRecentExpenseCount} expenses in 30 days are above the review threshold.`,
      headline: "Recent expenses deserve a closer look.",
      tone: "warning" as const,
    };
  }

  return {
    actionHref: attentionTotal > 0 ? "#focus-now" : "/timeline",
    actionLabel: attentionTotal > 0 ? "Review records" : "Open timeline",
    detail:
      attentionTotal > 0
        ? `${attentionTotal} operating checks are open across the portfolio.`
        : "No high-priority operating checks are open from the current data.",
    headline:
      attentionTotal > 0
        ? "Portfolio needs a light operating review."
        : "Portfolio is clear from the current checks.",
    tone: attentionTotal > 0 ? ("warning" as const) : ("success" as const),
  };
}

function buildMetrics({
  activeLeaseCount,
  attentionItems,
  leaseGapUnitCount,
  mtdLedgerRows,
  occupancyRate,
  peopleCount,
  roleCounts,
}: {
  activeLeaseCount: number;
  attentionItems: OverviewAttentionItem[];
  leaseGapUnitCount: number;
  mtdLedgerRows: LedgerWindowRow[];
  occupancyRate: string;
  peopleCount: number;
  roleCounts: Map<PersonRoleRow["role"], number>;
}): OverviewMetric[] {
  const attentionTotal = attentionItems.reduce((total, item) => total + item.count, 0);

  return [
    {
      helper: "Occupied units",
      label: "Occupancy",
      tone: "success",
      value: occupancyRate,
    },
    {
      helper: "Current tenant agreements",
      label: "Active leases",
      tone: "neutral",
      value: String(activeLeaseCount),
    },
    {
      helper: "Units without active lease",
      label: "Lease gaps",
      tone: leaseGapUnitCount > 0 ? "warning" : "success",
      value: String(leaseGapUnitCount),
    },
    {
      helper: "Tenants, owners, vendors",
      label: "People",
      tone: "neutral",
      value: `${peopleCount} / ${roleCounts.get("tenant") ?? 0} tenants`,
    },
    {
      helper: "Current month",
      label: "Ledger net",
      tone: "neutral",
      value: formatMoneyTotalsDisplay(mtdLedgerRows),
    },
    {
      helper: "Open operating checks",
      label: "Attention",
      tone: attentionTotal > 0 ? "warning" : "success",
      value: String(attentionTotal),
    },
  ];
}

function buildAttentionItems({
  invalidScopeLeases,
  largeRecentExpenseCount,
  leaseGapUnits,
  leasesEndingSoon,
  missingTenantLeases,
  missingOwnerLinks,
  openMaintenanceCount,
  peopleMissingContacts,
  peopleWithoutRoles,
  vacantUnits,
}: {
  invalidScopeLeases: number;
  largeRecentExpenseCount: number;
  leaseGapUnits: number;
  leasesEndingSoon: number;
  missingTenantLeases: number;
  missingOwnerLinks: number;
  openMaintenanceCount: number;
  peopleMissingContacts: number;
  peopleWithoutRoles: number;
  vacantUnits: number;
}): OverviewAttentionItem[] {
  const items: Array<OverviewAttentionItem | null> = [
    invalidScopeLeases > 0
      ? {
          actionLabel: "Review leases",
          count: invalidScopeLeases,
          helper: "Property or unit is not available",
          href: "/leases?archiveState=all&status=current",
          id: "lease-scope-review",
          kind: "data-quality",
          label: "Leases need placement review",
          priority: 50,
          tone: "warning",
        }
      : null,
    leasesEndingSoon > 0
      ? {
          actionLabel: "Review expiries",
          count: leasesEndingSoon,
          helper: "Next 60 days",
          href: "/leases?status=current&endsWithin=60d&sort=end_asc",
          id: "expiring-leases",
          kind: "expiring-lease",
          label: "Leases ending in 60d",
          priority: 60,
          tone: "warning",
        }
      : null,
    openMaintenanceCount > 0
      ? {
          actionLabel: "Review maintenance",
          count: openMaintenanceCount,
          helper: "Open cases",
          href: "/maintenance?review=open",
          id: "open-maintenance",
          kind: "urgent-maintenance",
          label: "Open maintenance",
          priority: 70,
          tone: "warning",
        }
      : null,
    vacantUnits > 0
      ? {
          actionLabel: "Review vacancies",
          count: vacantUnits,
          helper: "Marked vacant",
          href: "/units?status=vacant",
          id: "vacant-units",
          kind: "data-quality",
          label: "Vacant units",
          priority: 80,
          tone: "warning",
        }
      : null,
    leaseGapUnits > 0
      ? {
          actionLabel: "Link leases",
          count: leaseGapUnits,
          helper: "No active lease link",
          href: "/units?leaseStatus=missing",
          id: "lease-gaps",
          kind: "data-quality",
          label: "Lease gaps",
          priority: 90,
          tone: "warning",
        }
      : null,
    missingTenantLeases > 0
      ? {
          actionLabel: "Link tenants",
          count: missingTenantLeases,
          helper: "No People tenant link",
          href: "/leases?status=current&tenantStatus=missing",
          id: "missing-tenant-links",
          kind: "data-quality",
          label: "Leases missing tenant link",
          priority: 100,
          tone: "warning",
        }
      : null,
    missingOwnerLinks > 0
      ? {
          actionLabel: "Link owners",
          count: missingOwnerLinks,
          helper: "Needs ownership relationship",
          href: "/properties?ownerStatus=missing",
          id: "missing-owner-links",
          kind: "data-quality",
          label: "Properties without owner link",
          priority: 110,
          tone: "warning",
        }
      : null,
    peopleMissingContacts > 0
      ? {
          actionLabel: "Add contact details",
          count: peopleMissingContacts,
          helper: "No primary contact value",
          href: "/people?status=missing_contact",
          id: "missing-contact-details",
          kind: "data-quality",
          label: "People missing contact",
          priority: 120,
          tone: "warning",
        }
      : null,
    peopleWithoutRoles > 0
      ? {
          actionLabel: "Assign roles",
          count: peopleWithoutRoles,
          helper: "Needs tenant, owner, vendor, or staff role",
          href: "/people?status=no_role",
          id: "people-without-role",
          kind: "data-quality",
          label: "People without role",
          priority: 130,
          tone: "danger",
        }
      : null,
    largeRecentExpenseCount > 0
      ? {
          actionLabel: "Review expenses",
          count: largeRecentExpenseCount,
          helper: "Last 30 days above review threshold",
          href: largeExpenseReviewHref,
          id: "large-recent-expenses",
          kind: "unreconciled-finance",
          label: "Large expenses, 30d",
          priority: 140,
          tone: "warning",
        }
      : null,
  ];

  return items
    .filter((item): item is OverviewAttentionItem => Boolean(item))
    .toSorted(
      (left, right) =>
        left.priority - right.priority ||
        left.label.localeCompare(right.label) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 12);
}

function buildLedgerFlowChart({
  ledgerRows,
  monthStart,
  monthEnd,
}: {
  ledgerRows: LedgerWindowRow[];
  monthStart: Date;
  monthEnd: Date;
}): OverviewLedgerPoint[] {
  if (ledgerRows.length === 0) {
    return [];
  }

  const months = Array.from({ length: 6 }, (_, index) => addMonths(monthStart, index))
    .filter((month) => month <= monthEnd);
  const points = new Map(
    months.map((month) => [
      getMonthKey(month),
      {
        expense: 0,
        href: getLedgerMonthHref(month),
        income: 0,
        label: monthLabelFormatter.format(month),
        net: 0,
      },
    ]),
  );

  for (const row of ledgerRows) {
    const point = points.get(row.transaction_date.slice(0, 7));

    if (!point) {
      continue;
    }

    const amount = Math.round(Number(row.amount) * 100);

    if (row.direction === "expense") {
      point.expense += amount;
      point.net -= amount;
    } else {
      point.income += amount;
      point.net += amount;
    }
  }

  return Array.from(points.values(), (point) => ({
    ...point,
    expense: point.expense / 100,
    income: point.income / 100,
    net: point.net / 100,
  }));
}

function startOfMonth(value: string) {
  const year = Number(value.slice(0, 4));
  const monthIndex = Number(value.slice(5, 7)) - 1;

  return new Date(Date.UTC(year, monthIndex, 1));
}

function addMonths(value: Date, amount: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + amount, 1));
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getBusinessDateString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
  }).formatToParts(date);
  const getPart = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return `${getPart("year")}-${String(getPart("month")).padStart(2, "0")}-${String(
    getPart("day"),
  ).padStart(2, "0")}`;
}

function getMonthKey(value: Date) {
  return toDateInput(value).slice(0, 7);
}

function getLedgerMonthHref(monthStart: Date) {
  const nextMonthStart = addMonths(monthStart, 1);
  const monthEnd = addDays(nextMonthStart, -1);
  const params = new URLSearchParams({
    dateFrom: toDateInput(monthStart),
    dateTo: toDateInput(monthEnd),
    sort: "date_desc",
  });

  return `/ledger?${params.toString()}`;
}

function toDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function assertNoError(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load ${label}: ${error.message}`);
  }
}
