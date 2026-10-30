import type { CurrencyCode } from "@/lib/money/format";
import type { OverviewMaintenanceCase } from "../overview.types";

/** Wire contract for get_overview_summary. No individual finance or people rows. */
export type OverviewSummary = {
  counts: {
    activeLeaseCount: number;
    currentLeaseCount: number;
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
    peopleCount: number;
    tenantCount: number;
    ledgerEntryCount: number;
    occupiedUnits: number;
    unitCount: number;
  };
  expectedRent: { leaseCount: number; amount: number };
  leaseEndings: Array<{ month: string; count: number }>;
  ledger: Array<{ amount: number; currency: CurrencyCode; direction: string; transaction_date: string }>;
  properties: Array<{
    id: string;
    code: string;
    name: string;
    documentCount: number;
    missingTenantLinks: number;
    ownerLinked: boolean;
    totalUnits: number;
    occupiedUnits: number;
    unoccupiedUnits: number;
    vacantUnits: number;
    blockedCount: number;
    openCount: number;
    overdueCount: number;
    urgentCount: number;
    cases: Array<Omit<OverviewMaintenanceCase, "href">>;
  }>;
};
