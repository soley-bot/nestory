const legacyReportDestinations = {
  "income-expense": "/ledger",
  "lease-expiry": "/leases?status=current&endsWithin=60d&sort=end_asc",
  "maintenance-cost": "/maintenance",
  "missing-data": "/overview?lens=records",
  "people-readiness": "/people",
  "property-performance": "/overview?lens=finance",
  "rent-roll": "/units",
  "unit-performance": "/reports/unit-profit-loss",
  "vacancy-risk": "/units?occupancy=unoccupied",
} as const;

export type LegacyReportKind = keyof typeof legacyReportDestinations;

export function getLegacyReportDestination(value: string) {
  return value in legacyReportDestinations
    ? legacyReportDestinations[value as LegacyReportKind]
    : null;
}
