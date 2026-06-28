import { PageHeader } from "@/components/layout/page-header";

export default async function SettingsPage() {
  return (
    <div>
      <PageHeader
        description="Phase 1 keeps access simple while the operating record foundation settles."
        title="Settings"
      />
      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <section className="rounded-md border border-border bg-surface p-4 sm:p-5">
          <h2 className="text-base font-semibold">Organization settings</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            MVP settings are intentionally lean. Money is recorded in USD, and
            deeper organization controls will return after the unit record,
            reports, and CRUD flows are reliable.
          </p>
        </section>
      </div>
    </div>
  );
}
