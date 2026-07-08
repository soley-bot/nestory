import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

type PlaceholderPageProps = {
  params: Promise<{ placeholder: string }>;
};

type PlaceholderPage = {
  description: string;
  room: string;
  title: string;
};

const placeholderPages: Record<string, PlaceholderPage> = {
  amenities: {
    title: "Amenities",
    description: "Property amenities, shared facilities, and operating notes.",
    room: "Property",
  },
  "property-inspections": {
    title: "Property Inspections",
    description: "Property-level inspection plans and condition checks.",
    room: "Property",
  },
  inventory: {
    title: "Inventory",
    description: "Maintenance stock, tools, and supply tracking.",
    room: "Operations",
  },
  branding: {
    title: "Branding",
    description: "Brand colors, report identity, and organization presentation.",
    room: "Settings",
  },
  "property-settings": {
    title: "Property Settings",
    description: "Property defaults and organization-level record settings.",
    room: "Settings",
  },
  "people-settings": {
    title: "People Settings",
    description: "People defaults, role labels, vendor categories, and directory controls.",
    room: "Settings",
  },
  "lease-settings": {
    title: "Lease Settings",
    description: "Lease defaults, terms, and operating rules.",
    room: "Settings",
  },
  "maintenance-settings": {
    title: "Maintenance Settings",
    description: "Maintenance categories, priorities, and workflow defaults.",
    room: "Settings",
  },
  "financial-settings": {
    title: "Financial Settings",
    description: "Financial defaults, reporting periods, and ledger behavior.",
    room: "Settings",
  },
  notifications: {
    title: "Notification",
    description: "Notification channels, reminders, and alert defaults.",
    room: "Settings",
  },
  security: {
    title: "Security",
    description: "Authentication posture and account safety settings.",
    room: "Settings",
  },
  "backup-data": {
    title: "Backup and Data",
    description: "Backup schedule, restore points, export, and data safety.",
    room: "Settings",
  },
  integrations: {
    title: "Integration",
    description: "External system connections and import/export endpoints.",
    room: "Settings",
  },
};

export default async function PlaceholderPage({ params }: PlaceholderPageProps) {
  const { placeholder } = await params;
  const page = placeholderPages[placeholder];

  if (!page) {
    notFound();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        description={page.description}
        title={page.title}
        actions={
          <span className="rounded-md border border-border bg-surface-muted px-2 py-1 text-xs font-medium text-muted">
            {page.room}
          </span>
        }
      />
      <main className="grid min-h-0 flex-1 place-items-center px-4 py-8 sm:px-6">
        <section className="w-full max-w-2xl rounded-md border border-border bg-surface p-5">
          <p className="text-[13px] font-semibold uppercase text-muted">
            Planned workflow
          </p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">
            {page.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-foreground-muted">
            This area is reserved so operators know where the capability will
            live. Active records remain available in the connected modules.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <PlaceholderLink href="/overview" label="Overview" />
            <PlaceholderLink href="/properties" label="Properties" />
            <PlaceholderLink href="/maintenance" label="Maintenance" />
            <PlaceholderLink href="/reports" label="Reports" />
          </div>
        </section>
      </main>
    </div>
  );
}

function PlaceholderLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted"
      href={href}
    >
      {label}
      <ArrowUpRight size={14} />
    </Link>
  );
}
