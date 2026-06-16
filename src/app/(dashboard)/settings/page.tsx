import { PageHeader } from "@/components/layout/page-header";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        description="Phase 1 keeps access simple with one admin role."
        title="Settings"
      />
      <div className="p-8">
        <div className="rounded-md border border-border bg-surface p-6 text-sm text-muted">
          Organization and admin settings will stay minimal in Phase 1.
        </div>
      </div>
    </div>
  );
}
