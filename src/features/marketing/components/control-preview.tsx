import { OverviewHeaderContent } from "@/features/overview/components/overview-header";
import { PortfolioWorkspace } from "@/features/overview/components/portfolio-workspace";
import type {
  OverviewAttentionItem,
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";

const previewQuery = {
  financeView: "collections",
  lens: "all",
  month: "2026-08",
  propertyId: "all",
  review: "all",
} satisfies OverviewViewQuery;

const previewAttentionQueue = [
  {
    actionLabel: "Review rent",
    count: 3,
    helper: "Three tenant balances are past their due date.",
    href: "/ledger?review=arrears",
    id: "overdue-rent",
    kind: "overdue-rent",
    label: "Overdue rent",
    priority: 1,
    tone: "danger",
  },
  {
    actionLabel: "Open cases",
    count: 2,
    helper: "Two urgent cases are waiting for an operating decision.",
    href: "/maintenance?review=urgent",
    id: "urgent-maintenance",
    kind: "urgent-maintenance",
    label: "Urgent maintenance",
    priority: 2,
    tone: "warning",
  },
  {
    actionLabel: "Review leases",
    count: 4,
    helper: "Four leases end within the next sixty days.",
    href: "/leases?review=ending",
    id: "expiring-leases",
    kind: "expiring-lease",
    label: "Leases ending soon",
    priority: 3,
    tone: "warning",
  },
] satisfies OverviewAttentionItem[];

const previewData = {
  attentionItems: previewAttentionQueue,
  attentionTotal: 9,
  dashboardSummary: {
    actionHref: "/overview/attention?month=2026-08",
    actionLabel: "Review",
    detail: "Nine open checks",
    headline: "Needs review",
    tone: "warning",
  },
  expectedRent: {
    leaseCount: 39,
    monthly: { primary: "USD 39,250.00" },
  },
  leaseEndings: [],
  leaseRiskCount: 4,
  ledgerCurrency: "USD",
  ledgerFlow: [
    { expense: 6840, href: "/ledger?month=2026-03", income: 13400, label: "Mar", net: 6560 },
    { expense: 7210, href: "/ledger?month=2026-04", income: 14250, label: "Apr", net: 7040 },
    { expense: 6950, href: "/ledger?month=2026-05", income: 13800, label: "May", net: 6850 },
    { expense: 7640, href: "/ledger?month=2026-06", income: 15100, label: "Jun", net: 7460 },
    { expense: 7380, href: "/ledger?month=2026-07", income: 14850, label: "Jul", net: 7470 },
    { expense: 7920, href: "/ledger?month=2026-08", income: 15700, label: "Aug", net: 7780 },
  ],
  maintenanceByProperty: [],
  metrics: [
    { helper: "41 of 46 units occupied", label: "Occupancy", tone: "warning", value: "89%" },
    { helper: "Current tenant agreements", label: "Active leases", tone: "neutral", value: "39" },
    { helper: "Units without an active lease", label: "Lease gaps", tone: "warning", value: "3" },
    { helper: "Open operating checks", label: "Attention", tone: "warning", value: "9" },
  ],
  occupancyByProperty: [
    {
      href: "/properties/bassac-garden",
      label: "Bassac Garden Apartments",
      occupiedUnits: 12,
      percent: 92,
      totalUnits: 13,
      unoccupiedUnits: 1,
      vacantUnits: 1,
    },
    {
      href: "/properties/chroy-changvar",
      label: "Chroy Changvar River View",
      occupiedUnits: 10,
      percent: 83,
      totalUnits: 12,
      unoccupiedUnits: 2,
      vacantUnits: 2,
    },
    {
      href: "/properties/central-residence",
      label: "Central Residence",
      occupiedUnits: 11,
      percent: 92,
      totalUnits: 12,
      unoccupiedUnits: 1,
      vacantUnits: 1,
    },
    {
      href: "/properties/street-178",
      label: "Street 178 Residence",
      occupiedUnits: 8,
      percent: 89,
      totalUnits: 9,
      unoccupiedUnits: 1,
      vacantUnits: 1,
    },
  ],
  propertyOptions: [
    { label: "Bassac Garden Apartments", value: "bassac-garden" },
    { label: "Chroy Changvar River View", value: "chroy-changvar" },
    { label: "Central Residence", value: "central-residence" },
    { label: "Street 178 Residence", value: "street-178" },
  ],
  quickActions: [],
  recentChanges: [],
  recordsByProperty: [],
  workspaceSetup: {
    activeLeaseCount: 39,
    hasAnyOperatingData: true,
    ledgerEntryCount: 184,
    peopleCount: 76,
    propertyCount: 4,
    unitCount: 46,
  },
} satisfies OverviewScreenData;

export function ControlPreview() {
  return (
    <section
      aria-label="Current dashboard preview"
      className="relative max-h-[780px] overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-[0_24px_90px_rgb(15_23_42_/_12%)] dark:shadow-[0_24px_90px_rgb(0_0_0_/_34%)]"
      role="region"
    >
      <div inert className="pointer-events-none select-none">
        <div className="flex h-14 items-center border-b border-border bg-background px-4 lg:px-6">
          <OverviewHeaderContent />
        </div>
        <PortfolioWorkspace
          attentionQueue={previewAttentionQueue}
          data={previewData}
          query={previewQuery}
        />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent"
      />
    </section>
  );
}
