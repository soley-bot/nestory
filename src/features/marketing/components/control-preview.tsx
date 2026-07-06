import {
  ArrowRight,
  BarChart3,
  Building2,
  ChevronRight,
  Database,
  DollarSign,
  LayoutDashboard,
  Moon,
  Settings,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { NestoryLogo } from "@/components/brand/nestory-logo";

const navItems: Array<{ icon: LucideIcon; label: string; active?: boolean }> = [
  { icon: LayoutDashboard, label: "Overview", active: true },
  { icon: Building2, label: "Property" },
  { icon: Wrench, label: "Maintenance" },
  { icon: DollarSign, label: "Finance" },
  { icon: BarChart3, label: "Reports" },
  { icon: Database, label: "Data" },
];

const metrics = [
  { label: "Occupancy", value: "72%" },
  { label: "Current month net", value: "USD 7,420.00" },
  { label: "Lease risk, 60d", value: "7" },
  { label: "Open checks", value: "30" },
];

const occupancyRows = [
  ["Bassac Garden Apartments", "67%", "2/6 open", 82],
  ["Chroy Changvar River View", "67%", "2/6 open", 82],
  ["Central Residence", "67%", "2/6 open", 82],
  ["Street 178 Residence", "67%", "2/6 open", 82],
  ["Northline Mixed Use", "83%", "1/6 open", 44],
] as const;

const focusItems = [
  ["Leases ending in 60d", "Next 60 days", "7"],
  ["Open maintenance", "Open cases", "10"],
  ["Vacant units", "Marked vacant", "5"],
  ["Lease gaps", "No active lease link", "7"],
  ["Large expenses, 30d", "Above review threshold", "1"],
] as const;

const quickActions = [
  "Import data",
  "Add property",
  "Add unit",
  "Add lease",
  "Add person",
  "Add event",
];

export function ControlPreview() {
  return (
    <div className="overflow-hidden rounded-lg border border-[#dde2e8] bg-[#f4f6f8] text-[#071324] shadow-[0_24px_90px_rgba(15,23,42,0.10)]">
      <div className="grid lg:min-h-[430px] lg:grid-cols-[172px_minmax(0,1fr)_260px]">
        <Sidebar />

        <main className="min-w-0 border-t border-[#dde2e8] bg-[#f7f8fa] p-3 lg:border-l lg:border-t-0">
          <SummaryPanel />
          <MetricStrip />

          <div className="mt-3 grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(260px,0.95fr)]">
            <OccupancyPanel />
            <div className="grid min-w-0 gap-3">
              <CashMovementPanel />
              <LeaseEndingPanel />
            </div>
          </div>
        </main>

        <aside className="hidden min-w-0 border-l border-[#dde2e8] bg-[#fbfbfc] p-3 lg:block">
          <FocusPanel />
          <QuickActionsPanel />
        </aside>
      </div>
      <ControlPreviewMotion />
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="bg-[#fbfbfc]">
      <div className="flex items-center justify-between border-b border-[#dde2e8] px-3 py-3">
        <NestoryLogo
          markClassName="h-7 w-7"
          priority
          subtitle="Dashboard"
          subtitleClassName="text-[8px] tracking-[0.18em] text-[#5e6a78]"
          textClassName="text-[12px] text-[#071324]"
        />
        <span className="grid size-5 place-items-center rounded border border-[#dde2e8] text-[#687386]">
          <ChevronRight size={12} />
        </span>
      </div>

      <div className="px-2 py-3">
        <p className="px-1.5 text-[8px] font-semibold uppercase tracking-[0.22em] text-[#687386]">
          Workspace
        </p>
        <nav className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:block lg:space-y-1">
          {navItems.map((item) => (
            <div
              className={[
                "flex h-8 items-center gap-2 rounded-md px-2 text-[11px] font-medium",
                item.active ? "bg-[#edf0f3] text-[#071324]" : "text-[#465263]",
              ].join(" ")}
              key={item.label}
            >
              <item.icon size={13} strokeWidth={1.8} />
              <span className="truncate">{item.label}</span>
            </div>
          ))}
        </nav>
      </div>

      <div className="hidden border-t border-[#dde2e8] px-3 py-3 lg:mt-8 lg:block">
        <div className="flex items-center justify-between text-[#465263]">
          <span className="flex items-center gap-2 text-[11px]">
            <Settings size={13} />
            Settings
          </span>
          <Moon size={13} />
        </div>
      </div>
    </aside>
  );
}

function SummaryPanel() {
  return (
    <section className="rounded-md border border-[#dde2e8] bg-white p-3 shadow-[0_1px_5px_rgba(15,23,42,0.08)]">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <span className="inline-flex rounded border border-[#e5cfa8] bg-[#fff8ed] px-1.5 py-0.5 text-[9px] font-medium text-[#8a5a16]">
            Needs review
          </span>
          <h3 className="mt-2 truncate text-[15px] font-semibold leading-5">
            5 vacant units are available.
          </h3>
          <p className="mt-1 line-clamp-1 text-[11px] text-[#465263]">
            Review availability, attach new leases, or make the vacant-units report.
          </p>
        </div>
        <span className="hidden h-8 items-center gap-1.5 rounded-md border border-[#dde2e8] bg-white px-2.5 text-[11px] font-medium shadow-sm sm:inline-flex">
          View vacant units
          <ArrowRight size={13} />
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-md border border-[#dde2e8]">
        {[
          ["Lease gaps", "7"],
          ["Active leases", "24"],
          ["Open checks", "30"],
        ].map(([label, value]) => (
          <div
            className="flex items-center justify-between gap-2 border-r border-[#dde2e8] px-2 py-2 text-[10px] last:border-r-0 sm:px-3 sm:text-[11px]"
            key={label}
          >
            <span className="text-[#5e6a78]">{label}</span>
            <span className="font-semibold tabular-nums">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricStrip() {
  return (
    <section className="mt-3 grid grid-cols-2 overflow-hidden rounded-md border border-[#dde2e8] bg-white shadow-[0_1px_5px_rgba(15,23,42,0.06)] xl:grid-cols-4">
      {metrics.map((metric) => (
        <div className="border-b border-r border-[#dde2e8] px-3 py-3 even:border-r-0 last:border-b-0 xl:border-b-0 xl:even:border-r xl:last:border-r-0" key={metric.label}>
          <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-[#687386]">
            {metric.label}
          </p>
          <p className="mt-1 text-[15px] font-semibold tabular-nums">{metric.value}</p>
        </div>
      ))}
    </section>
  );
}

function OccupancyPanel() {
  return (
    <section className="rounded-md border border-[#dde2e8] bg-white p-3 shadow-[0_1px_5px_rgba(15,23,42,0.06)]">
      <PanelHeader action="Review open units" title="Lowest occupancy by property" />
      <div className="mt-3 space-y-3">
        {occupancyRows.map(([label, percent, open, width], index) => (
          <div className={index > 2 ? "hidden min-w-0 sm:block" : "min-w-0"} key={label}>
            <div className="flex min-w-0 items-center justify-between gap-3 text-[11px]">
              <span className="truncate font-medium">{label}</span>
              <span className="shrink-0 font-semibold text-[#8a5a16] tabular-nums">
                {percent}
              </span>
            </div>
            <div className="mt-1.5 grid min-w-0 grid-cols-[minmax(0,1fr)_58px] items-center gap-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-[#edf0f3]">
                <span
                  className="block h-full rounded-full bg-[#9b6a2b]"
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="text-right text-[10px] text-[#465263]">{open}</span>
            </div>
            <p className="mt-1 text-[10px] text-[#687386]">4/6 occupied</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CashMovementPanel() {
  return (
    <section className="rounded-md border border-[#dde2e8] bg-white p-3 shadow-[0_1px_5px_rgba(15,23,42,0.06)]">
      <PanelHeader action="Open ledger" title="Cash movement, 6 months" />
      <div className="relative mt-3 h-36 overflow-hidden">
        <div className="absolute inset-x-0 top-2 space-y-8 text-[9px] text-[#8a94a3]">
          {["8k", "6k", "4k", "2k"].map((tick) => (
            <div className="grid grid-cols-[22px_minmax(0,1fr)] items-center gap-1" key={tick}>
              <span>{tick}</span>
              <span className="border-t border-dashed border-[#dde2e8]" />
            </div>
          ))}
        </div>
        <svg
          aria-hidden="true"
          className="absolute inset-x-4 bottom-4 h-[96px] w-[calc(100%-2rem)]"
          preserveAspectRatio="none"
          viewBox="0 0 320 96"
        >
          <path
            d="M0 88 C52 88 92 88 130 88 C164 88 178 24 212 24 C250 24 274 88 320 88"
            fill="none"
            stroke="#9aa3af"
            strokeWidth="2.4"
          />
          <path
            className="nestory-preview-chart-fill"
            d="M0 88 C74 88 146 88 216 88 C254 88 282 58 320 10 L320 96 L0 96 Z"
            fill="#1f4e8c"
            opacity="0.08"
          />
          <path
            className="nestory-preview-chart-line"
            d="M0 88 C74 88 146 88 216 88 C254 88 282 58 320 10"
            fill="none"
            stroke="#1f4e8c"
            strokeLinecap="round"
            strokeWidth="2.8"
          />
        </svg>
        <div className="absolute inset-x-9 bottom-0 flex justify-between text-[9px] text-[#687386]">
          {["Feb", "Mar", "Apr", "May", "Jun", "Jul"].map((month) => (
            <span key={month}>{month}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function LeaseEndingPanel() {
  return (
    <section className="hidden rounded-md border border-[#dde2e8] bg-white p-3 shadow-[0_1px_5px_rgba(15,23,42,0.06)] sm:block">
      <PanelHeader action="Open leases" title="Lease endings by month" />
      <div className="mt-3 grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4">
        <div
          className="relative size-20 rounded-full"
          style={{
            background:
              "conic-gradient(#1f4e8c 0 37%, #8893a1 37% 61%, #9b6a2b 61% 77%, #c95151 77% 90%, #e8ebef 90% 100%)",
          }}
        >
          <div className="absolute inset-4 grid place-items-center rounded-full bg-white text-center">
            <span className="text-base font-semibold leading-none">17</span>
            <span className="text-[9px] text-[#687386]">endings</span>
          </div>
        </div>
        <div className="space-y-1.5 text-[10px] text-[#465263]">
          {[
            ["Jul", "5"],
            ["Aug", "2"],
            ["Sep", "2"],
            ["Nov", "4"],
          ].map(([label, value]) => (
            <div className="flex items-center justify-between gap-2" key={label}>
              <span>{label}</span>
              <span className="font-semibold tabular-nums text-[#071324]">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FocusPanel() {
  return (
    <section className="rounded-md border border-[#dde2e8] bg-white shadow-[0_1px_5px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between border-b border-[#dde2e8] px-3 py-3">
        <h4 className="text-[13px] font-semibold">Focus now</h4>
        <span className="rounded border border-[#e5cfa8] bg-[#fff8ed] px-1.5 py-0.5 text-[9px] text-[#8a5a16]">
          30
        </span>
      </div>
      <div className="divide-y divide-[#dde2e8]">
        {focusItems.map(([label, sublabel, count], index) => (
          <div className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-3" key={label}>
            <span className="grid size-6 place-items-center rounded-md border border-[#dde2e8] text-[10px] text-[#687386]">
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-semibold">{label}</span>
              <span className="block truncate text-[10px] text-[#687386]">{sublabel}</span>
            </span>
            <span className="rounded border border-[#e5cfa8] bg-[#fff8ed] px-1.5 py-0.5 text-[9px] text-[#8a5a16]">
              {count}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuickActionsPanel() {
  return (
    <section className="mt-3 rounded-md border border-[#dde2e8] bg-white p-3 shadow-[0_1px_5px_rgba(15,23,42,0.06)]">
      <h4 className="text-[13px] font-semibold">Quick actions</h4>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {quickActions.map((action) => (
          <span
            className="grid h-8 place-items-center rounded-md border border-[#dde2e8] text-[10px] font-medium"
            key={action}
          >
            {action}
          </span>
        ))}
      </div>
    </section>
  );
}

function PanelHeader({ action, title }: { action: string; title: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <h4 className="truncate text-[13px] font-semibold">{title}</h4>
      <span className="hidden shrink-0 items-center gap-1 text-[10px] text-[#5e6a78] sm:inline-flex">
        {action}
        <ArrowRight size={12} />
      </span>
    </div>
  );
}

function ControlPreviewMotion() {
  return (
    <style>
      {`
        .nestory-preview-chart-line {
          stroke-dasharray: 420;
          stroke-dashoffset: 420;
          animation: nestory-preview-draw 2.4s ease-out infinite;
        }

        .nestory-preview-chart-fill {
          animation: nestory-preview-fade 2.4s ease-out infinite;
        }

        @keyframes nestory-preview-draw {
          0% { stroke-dashoffset: 420; opacity: 0.3; }
          35%, 82% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0.35; }
        }

        @keyframes nestory-preview-fade {
          0%, 20% { opacity: 0; }
          45%, 82% { opacity: 0.08; }
          100% { opacity: 0.02; }
        }

        @media (prefers-reduced-motion: reduce) {
          .nestory-preview-chart-line,
          .nestory-preview-chart-fill {
            animation: none;
          }

          .nestory-preview-chart-line {
            stroke-dashoffset: 0;
          }
        }
      `}
    </style>
  );
}
