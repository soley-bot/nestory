import { toRecentChange } from "@/features/activity/recent-changes";
import { getOrganizationCurrencySettings } from "@/features/settings/data/settings";
import type {
  OverviewAttentionItem,
  OverviewLedgerPoint,
  OverviewMetric,
  OverviewOccupancyPoint,
  OverviewScreenData,
} from "@/features/overview/overview.types";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  convertMoney,
  normalizeCurrencyDisplaySettings,
  type CurrencyCode,
} from "@/lib/money/format";
import { formatMoneyTotalsDisplay } from "@/lib/money/totals";

const activeLeaseStatuses = new Set(["active", "notice_given"]);
const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
});

type PropertyRow = {
  archived_at: string | null;
  code: string;
  id: string;
  name: string;
  owner: string | null;
};

type UnitRow = {
  archived_at: string | null;
  id: string;
  property_id: string;
  status: string;
  unit_number: string;
};

type LeaseRow = {
  archived_at: string | null;
  id: string;
  lease_end_date: string;
  property_id: string;
  status: string;
  tenant_name: string;
  unit_id: string | null;
};

type LedgerRow = {
  amount: number;
  archived_at: string | null;
  category: string;
  currency: CurrencyCode;
  description: string | null;
  direction: string;
  id: string;
  property_id: string;
  transaction_date: string;
  unit_id: string | null;
};

type PersonRow = {
  archived_at: string | null;
  display_name: string;
  id: string;
  primary_email: string | null;
  primary_phone: string | null;
};

type PersonRoleRow = {
  archived_at: string | null;
  person_id: string;
  role: "owner" | "tenant" | "vendor";
  status: string;
};

type PersonContactRow = {
  archived_at: string | null;
  contact_name: string | null;
  email: string | null;
  is_primary: boolean;
  person_id: string;
  phone: string | null;
};

type PropertyOwnerRow = {
  archived_at: string | null;
  ended_on: string | null;
  is_primary: boolean;
  person_id: string;
  property_id: string;
};

export async function getOverviewScreenData(
  organizationId: string,
): Promise<OverviewScreenData> {
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const businessToday = getBusinessDateString(now);
  const currentMonthStart = startOfMonth(businessToday);
  const ledgerStart = addMonths(currentMonthStart, -5);
  const recentExpenseStart = addDaysToDateString(businessToday, -30);

  const [
    propertiesResult,
    unitsResult,
    leasesResult,
    ledgerResult,
    peopleResult,
    rolesResult,
    contactsResult,
    propertyOwnersResult,
    recentActivityResult,
    currencySettings,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id, code, name, owner, archived_at")
      .eq("organization_id", organizationId)
      .order("code", { ascending: true }),
    supabase
      .from("units")
      .select("id, property_id, unit_number, status, archived_at")
      .eq("organization_id", organizationId),
    supabase
      .from("leases")
      .select(
        "id, property_id, unit_id, tenant_name, lease_end_date, status, archived_at",
      )
      .eq("organization_id", organizationId),
    supabase
      .from("ledger_entries")
      .select(
        "id, property_id, unit_id, transaction_date, direction, category, amount, currency, description, archived_at",
      )
      .eq("organization_id", organizationId),
    supabase
      .from("people")
      .select("id, display_name, primary_email, primary_phone, archived_at")
      .eq("organization_id", organizationId),
    supabase
      .from("person_roles")
      .select("person_id, role, status, archived_at")
      .eq("organization_id", organizationId),
    supabase
      .from("person_contacts")
      .select("person_id, contact_name, email, phone, is_primary, archived_at")
      .eq("organization_id", organizationId),
    supabase
      .from("property_owners")
      .select("property_id, person_id, is_primary, ended_on, archived_at")
      .eq("organization_id", organizationId),
    supabase
      .from("activity_logs")
      .select(
        "id, entity_type, entity_id, action, previous_values, new_values, created_at",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(8),
    getOrganizationCurrencySettings(organizationId),
  ]);

  assertNoError(propertiesResult.error, "overview properties");
  assertNoError(unitsResult.error, "overview units");
  assertNoError(leasesResult.error, "overview leases");
  assertNoError(ledgerResult.error, "overview ledger");
  assertNoError(peopleResult.error, "overview people");
  assertNoError(rolesResult.error, "overview person roles");
  assertNoError(contactsResult.error, "overview person contacts");
  assertNoError(propertyOwnersResult.error, "overview property owners");
  assertNoError(recentActivityResult.error, "overview activity");

  const normalizedSettings = normalizeCurrencyDisplaySettings(currencySettings);
  const properties = (propertiesResult.data ?? []) as PropertyRow[];
  const units = (unitsResult.data ?? []) as UnitRow[];
  const leases = (leasesResult.data ?? []) as LeaseRow[];
  const ledgerRows = (ledgerResult.data ?? []) as LedgerRow[];
  const people = (peopleResult.data ?? []) as PersonRow[];
  const roles = (rolesResult.data ?? []) as PersonRoleRow[];
  const contacts = (contactsResult.data ?? []) as PersonContactRow[];
  const propertyOwners = (propertyOwnersResult.data ?? []) as PropertyOwnerRow[];
  const activeProperties = properties.filter((property) => !property.archived_at);
  const operationalUnits = units.filter(
    (unit) => !unit.archived_at && unit.status !== "inactive",
  );
  const currentLeases = leases.filter(
    (lease) =>
      !lease.archived_at && activeLeaseStatuses.has(lease.status.toLowerCase()),
  );
  const currentLeasedUnitIds = new Set(
    currentLeases.flatMap((lease) => (lease.unit_id ? [lease.unit_id] : [])),
  );
  const occupiedUnits = operationalUnits.filter(
    (unit) =>
      currentLeasedUnitIds.has(unit.id) || unit.status.toLowerCase() === "occupied",
  );
  const leaseGapUnits = operationalUnits.filter(
    (unit) => !currentLeasedUnitIds.has(unit.id),
  );
  const vacantUnits = operationalUnits.filter(
    (unit) => unit.status.toLowerCase() === "vacant",
  );
  const nonVacantLeaseGapUnits = leaseGapUnits.filter(
    (unit) => unit.status.toLowerCase() !== "vacant",
  );
  const activePeople = people.filter((person) => !person.archived_at);
  const roleCounts = getRoleCounts(roles);
  const currentPropertyOwnerIds = new Set(
    propertyOwners
      .filter((owner) => owner.is_primary && !owner.archived_at && !owner.ended_on)
      .map((owner) => owner.property_id),
  );
  const missingOwnerLinks = activeProperties.filter(
    (property) => !currentPropertyOwnerIds.has(property.id),
  );
  const peopleMissingContacts = activePeople.filter((person) =>
    isMissingContact(person, contacts),
  );
  const peopleWithoutRoles = activePeople.filter(
    (person) => !hasActiveRole(person.id, roles),
  );
  const leasesEndingSoon = getLeasesEndingSoon(currentLeases, businessToday);
  const largeRecentExpenses = getLargeRecentExpenses({
    ledgerRows,
    normalizedSettings,
    recentExpenseStart,
  });
  const negativeNetProperties = getNegativeNetProperties({
    ledgerRows,
    normalizedSettings,
    properties: activeProperties,
  });
  const currentMonthEnd = addMonths(currentMonthStart, 1);
  const mtdLedgerRows = ledgerRows.filter(
    (entry) =>
      !entry.archived_at &&
      entry.transaction_date >= toDateInput(currentMonthStart) &&
      entry.transaction_date < toDateInput(currentMonthEnd),
  );
  const occupancyRate =
    operationalUnits.length > 0
      ? `${Math.round((occupiedUnits.length / operationalUnits.length) * 100)}%`
      : "0%";
  const attentionItems = buildAttentionItems({
    largeRecentExpenses,
    leaseGapUnits: nonVacantLeaseGapUnits,
    leasesEndingSoon,
    missingOwnerLinks,
    negativeNetProperties,
    peopleMissingContacts,
    peopleWithoutRoles,
    vacantUnits,
  });

  return {
    attentionItems,
    attentionTotal: attentionItems.reduce((total, item) => total + item.count, 0),
    dashboardSummary: buildDashboardSummary({
      attentionItems,
      largeRecentExpenses,
      leaseGapUnits: nonVacantLeaseGapUnits,
      leasesEndingSoon,
      missingOwnerLinks,
      negativeNetProperties,
      peopleMissingContacts,
      peopleWithoutRoles,
      vacantUnits,
    }),
    leaseEndings: buildLeaseEndingsChart(currentLeases, currentMonthStart),
    leaseRiskCount: leasesEndingSoon.length,
    ledgerCurrency: normalizedSettings.preferredCurrency,
    ledgerFlow: buildLedgerFlowChart({
      ledgerRows,
      monthStart: ledgerStart,
      normalizedSettings,
    }),
    metrics: buildMetrics({
      activeLeaseCount: currentLeases.length,
      attentionItems,
      mtdLedgerRows,
      occupancyRate,
      peopleCount: activePeople.length,
      roleCounts,
      leaseGapUnitCount: nonVacantLeaseGapUnits.length,
      currencySettings,
    }),
    occupancyByProperty: buildOccupancyByProperty({
      activeProperties,
      currentLeasedUnitIds,
      operationalUnits,
    }),
    quickActions: [
      { href: "/import", label: "Import data" },
      { href: "/properties?action=create", label: "Add property" },
      { href: "/units?action=create", label: "Add unit" },
      { href: "/leases?action=create", label: "Add lease" },
      { href: "/people?action=create", label: "Add person" },
      { href: "/timeline?action=create", label: "Add event" },
      { href: "/ledger?action=create", label: "Add ledger entry" },
    ],
    recentChanges: (recentActivityResult.data ?? []).map(toRecentChange),
  };
}

function buildDashboardSummary({
  attentionItems,
  largeRecentExpenses,
  leaseGapUnits,
  leasesEndingSoon,
  missingOwnerLinks,
  negativeNetProperties,
  peopleMissingContacts,
  peopleWithoutRoles,
  vacantUnits,
}: {
  attentionItems: OverviewAttentionItem[];
  largeRecentExpenses: LedgerRow[];
  leaseGapUnits: UnitRow[];
  leasesEndingSoon: LeaseRow[];
  missingOwnerLinks: PropertyRow[];
  negativeNetProperties: PropertyRow[];
  peopleMissingContacts: PersonRow[];
  peopleWithoutRoles: PersonRow[];
  vacantUnits: UnitRow[];
}) {
  const attentionTotal = attentionItems.reduce((total, item) => total + item.count, 0);

  if (peopleWithoutRoles.length > 0) {
    return {
      actionHref: "/people?status=no_role",
      actionLabel: "Review people",
      detail: `${peopleWithoutRoles.length} people need a tenant, owner, or vendor role before workflow checks are reliable.`,
      headline: "People records need cleanup first.",
      tone: "danger" as const,
    };
  }

  if (vacantUnits.length > 0) {
    return {
      actionHref: "/units?status=vacant",
      actionLabel: "View vacant units",
      detail: "Review availability, attach new leases, or make the vacant-units report.",
      headline: `${vacantUnits.length} vacant units are available.`,
      tone: "warning" as const,
    };
  }

  if (leaseGapUnits.length > 0) {
    return {
      actionHref: "/units?leaseStatus=missing",
      actionLabel: "Review lease gaps",
      detail: "Some unit records have no current lease link.",
      headline: `${leaseGapUnits.length} units need lease record review.`,
      tone: "warning" as const,
    };
  }

  if (leasesEndingSoon.length > 0) {
    return {
      actionHref: "/leases?status=current&endsWithin=60d&sort=end_asc",
      actionLabel: "Review leases",
      detail: `${leasesEndingSoon.length} leases end in 60 days. Start renewal or move-out planning here.`,
      headline: "Lease renewals need attention.",
      tone: "warning" as const,
    };
  }

  if (missingOwnerLinks.length > 0) {
    return {
      actionHref: "/properties?ownerStatus=missing",
      actionLabel: "Review missing owners",
      detail: `${missingOwnerLinks.length} properties are missing a current primary owner.`,
      headline: "Owner relationships need cleanup.",
      tone: "warning" as const,
    };
  }

  if (negativeNetProperties.length > 0) {
    return {
      actionHref: "/properties?netStatus=negative&sort=net_asc",
      actionLabel: "Review net income",
      detail: `${negativeNetProperties.length} properties have negative active ledger net income.`,
      headline: "Property net income needs review.",
      tone: "warning" as const,
    };
  }

  if (peopleMissingContacts.length > 0) {
    return {
      actionHref: "/people?status=missing_contact",
      actionLabel: "Review missing contacts",
      detail: `${peopleMissingContacts.length} people are missing usable contact information.`,
      headline: "Contact records need review.",
      tone: "warning" as const,
    };
  }

  if (largeRecentExpenses.length > 0) {
    return {
      actionHref: "/ledger?direction=expense&sort=amount_desc&period=last_30_days",
      actionLabel: "Review expenses",
      detail: `${largeRecentExpenses.length} expenses in 30 days are above the review threshold.`,
      headline: "Recent expenses deserve a closer look.",
      tone: "warning" as const,
    };
  }

  return {
    actionHref: "/timeline",
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
  currencySettings,
  leaseGapUnitCount,
  mtdLedgerRows,
  occupancyRate,
  peopleCount,
  roleCounts,
}: {
  activeLeaseCount: number;
  attentionItems: OverviewAttentionItem[];
  currencySettings: Awaited<ReturnType<typeof getOrganizationCurrencySettings>>;
  leaseGapUnitCount: number;
  mtdLedgerRows: LedgerRow[];
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
      value: formatMoneyTotalsDisplay(mtdLedgerRows, currencySettings),
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
  largeRecentExpenses,
  leaseGapUnits,
  leasesEndingSoon,
  missingOwnerLinks,
  negativeNetProperties,
  peopleMissingContacts,
  peopleWithoutRoles,
  vacantUnits,
}: {
  largeRecentExpenses: LedgerRow[];
  leaseGapUnits: UnitRow[];
  leasesEndingSoon: LeaseRow[];
  missingOwnerLinks: PropertyRow[];
  negativeNetProperties: PropertyRow[];
  peopleMissingContacts: PersonRow[];
  peopleWithoutRoles: PersonRow[];
  vacantUnits: UnitRow[];
}): OverviewAttentionItem[] {
  return [
    leasesEndingSoon.length > 0
      ? {
          count: leasesEndingSoon.length,
          helper: "Next 60 days",
          href: "/leases?status=current&endsWithin=60d&sort=end_asc",
          label: "Leases ending in 60d",
          tone: "warning",
        }
      : null,
    vacantUnits.length > 0
      ? {
          count: vacantUnits.length,
          helper: "Marked vacant",
          href: "/units?status=vacant",
          label: "Vacant units",
          tone: "warning",
        }
      : null,
    leaseGapUnits.length > 0
      ? {
          count: leaseGapUnits.length,
          helper: "No active lease link",
          href: "/units?leaseStatus=missing",
          label: "Lease gaps",
          tone: "warning",
        }
      : null,
    missingOwnerLinks.length > 0
      ? {
          count: missingOwnerLinks.length,
          helper: "Needs ownership relationship",
          href: "/properties?ownerStatus=missing",
          label: "Properties without owner link",
          tone: "warning",
        }
      : null,
    negativeNetProperties.length > 0
      ? {
          count: negativeNetProperties.length,
          helper: "Active ledger net is below zero",
          href: "/properties?netStatus=negative&sort=net_asc",
          label: "Properties with negative net",
          tone: "warning",
        }
      : null,
    peopleMissingContacts.length > 0
      ? {
          count: peopleMissingContacts.length,
          helper: "No primary contact value",
          href: "/people?status=missing_contact",
          label: "People missing contact",
          tone: "warning",
        }
      : null,
    peopleWithoutRoles.length > 0
      ? {
          count: peopleWithoutRoles.length,
          helper: "Needs tenant, owner, or vendor role",
          href: "/people?status=no_role",
          label: "People without role",
          tone: "danger",
        }
      : null,
    largeRecentExpenses.length > 0
      ? {
          count: largeRecentExpenses.length,
          helper: "Last 30 days above review threshold",
          href: "/ledger?direction=expense&sort=amount_desc&period=last_30_days",
          label: "Large expenses, 30d",
          tone: "warning",
        }
      : null,
  ].filter((item): item is OverviewAttentionItem => Boolean(item));
}

function buildOccupancyByProperty({
  activeProperties,
  currentLeasedUnitIds,
  operationalUnits,
}: {
  activeProperties: PropertyRow[];
  currentLeasedUnitIds: Set<string>;
  operationalUnits: UnitRow[];
}): OverviewOccupancyPoint[] {
  const unitsByProperty = groupBy(operationalUnits, (unit) => unit.property_id);

  return activeProperties
    .map((property) => {
      const propertyUnits = unitsByProperty.get(property.id) ?? [];
      const occupiedUnits = propertyUnits.filter(
        (unit) =>
          currentLeasedUnitIds.has(unit.id) ||
          unit.status.toLowerCase() === "occupied",
      ).length;
      const vacantUnits = propertyUnits.filter(
        (unit) => unit.status.toLowerCase() === "vacant",
      ).length;
      const unoccupiedUnits = propertyUnits.filter(
        (unit) =>
          !currentLeasedUnitIds.has(unit.id) &&
          unit.status.toLowerCase() !== "occupied" &&
          unit.status.toLowerCase() !== "inactive",
      ).length;

      return {
        href: `/units?occupancy=unoccupied&propertyId=${property.id}`,
        label: `${property.code} / ${property.name}`,
        occupiedUnits,
        percent:
          propertyUnits.length > 0
            ? Math.round((occupiedUnits / propertyUnits.length) * 100)
            : 0,
        totalUnits: propertyUnits.length,
        unoccupiedUnits,
        vacantUnits,
      };
    })
    .toSorted(
      (first, second) =>
        first.percent - second.percent ||
        second.totalUnits - first.totalUnits ||
        first.label.localeCompare(second.label),
    )
    .slice(0, 8);
}

function buildLedgerFlowChart({
  ledgerRows,
  monthStart,
  normalizedSettings,
}: {
  ledgerRows: LedgerRow[];
  monthStart: Date;
  normalizedSettings: ReturnType<typeof normalizeCurrencyDisplaySettings>;
}): OverviewLedgerPoint[] {
  const months = Array.from({ length: 6 }, (_, index) => addMonths(monthStart, index));
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
    if (row.archived_at) {
      continue;
    }

    const point = points.get(row.transaction_date.slice(0, 7));

    if (!point) {
      continue;
    }

    const amount = convertMoney(
      Number(row.amount),
      row.currency,
      normalizedSettings.preferredCurrency,
      normalizedSettings.khrPerUsd,
    );

    if (row.direction === "expense") {
      point.expense += amount;
      point.net -= amount;
    } else {
      point.income += amount;
      point.net += amount;
    }
  }

  return Array.from(points.values());
}

function buildLeaseEndingsChart(
  currentLeases: LeaseRow[],
  currentMonthStart: Date,
) {
  const months = Array.from({ length: 6 }, (_, index) =>
    addMonths(currentMonthStart, index),
  );
  const points = new Map(
    months.map((month) => [
      getMonthKey(month),
      {
        count: 0,
        href: `/leases?status=current&endMonth=${getMonthKey(month)}&sort=end_asc`,
        label: monthLabelFormatter.format(month),
      },
    ]),
  );

  for (const lease of currentLeases) {
    const point = points.get(lease.lease_end_date.slice(0, 7));

    if (point) {
      point.count += 1;
    }
  }

  return Array.from(points.values());
}

function getLeasesEndingSoon(currentLeases: LeaseRow[], today: string) {
  const soon = addDaysToDateString(today, 60);

  return currentLeases.filter(
    (lease) => lease.lease_end_date >= today && lease.lease_end_date <= soon,
  );
}

function getLargeRecentExpenses({
  ledgerRows,
  normalizedSettings,
  recentExpenseStart,
}: {
  ledgerRows: LedgerRow[];
  normalizedSettings: ReturnType<typeof normalizeCurrencyDisplaySettings>;
  recentExpenseStart: string;
}) {
  const threshold =
    normalizedSettings.preferredCurrency === "USD" ? 1000 : 4_100_000;

  return ledgerRows.filter((row) => {
    if (
      row.archived_at ||
      row.direction !== "expense" ||
      row.transaction_date < recentExpenseStart
    ) {
      return false;
    }

    return (
      convertMoney(
        Number(row.amount),
        row.currency,
        normalizedSettings.preferredCurrency,
        normalizedSettings.khrPerUsd,
      ) >= threshold
    );
  });
}

function getNegativeNetProperties({
  ledgerRows,
  normalizedSettings,
  properties,
}: {
  ledgerRows: LedgerRow[];
  normalizedSettings: ReturnType<typeof normalizeCurrencyDisplaySettings>;
  properties: PropertyRow[];
}) {
  const netByProperty = new Map<string, number>();

  for (const row of ledgerRows) {
    if (row.archived_at) {
      continue;
    }

    const amount = convertMoney(
      Number(row.amount),
      row.currency,
      "USD",
      normalizedSettings.khrPerUsd,
    );
    const signedAmount = row.direction === "expense" ? -amount : amount;

    netByProperty.set(
      row.property_id,
      (netByProperty.get(row.property_id) ?? 0) + signedAmount,
    );
  }

  return properties
    .filter((property) => (netByProperty.get(property.id) ?? 0) < 0)
    .toSorted(
      (first, second) =>
        (netByProperty.get(first.id) ?? 0) -
          (netByProperty.get(second.id) ?? 0) ||
        first.code.localeCompare(second.code),
    );
}

function getRoleCounts(roles: PersonRoleRow[]) {
  const counts = new Map<PersonRoleRow["role"], number>();

  for (const role of roles) {
    if (role.archived_at || role.status !== "active") {
      continue;
    }

    counts.set(role.role, (counts.get(role.role) ?? 0) + 1);
  }

  return counts;
}

function hasActiveRole(personId: string, roles: PersonRoleRow[]) {
  return roles.some(
    (role) =>
      role.person_id === personId && !role.archived_at && role.status === "active",
  );
}

function isMissingContact(person: PersonRow, contacts: PersonContactRow[]) {
  if (hasText(person.primary_email) || hasText(person.primary_phone)) {
    return false;
  }

  return !contacts.some(
    (contact) =>
      contact.person_id === person.id &&
      !contact.archived_at &&
      (hasText(contact.email) ||
        hasText(contact.phone) ||
        hasText(contact.contact_name)),
  );
}

function hasText(value: string | null) {
  return Boolean(value?.trim());
}

function groupBy<T>(rows: T[], getKey: (row: T) => string) {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const key = getKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return groups;
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

function addDaysToDateString(value: string, days: number) {
  const next = new Date(`${value}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);

  return next.toISOString().slice(0, 10);
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
