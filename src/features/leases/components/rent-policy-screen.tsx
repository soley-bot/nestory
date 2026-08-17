import { Badge } from "@/components/ui/badge";
import type { RentPolicyVersion } from "@/features/leases/data/rent-policy";

type RentPolicyScreenProps = {
  versions: RentPolicyVersion[];
};

export function RentPolicyScreen({ versions }: RentPolicyScreenProps) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <section className="rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Historical rent policies</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              New Leases keep these rules on the Lease itself. This history stays
              available for invoices and charges created under the older model.
            </p>
          </div>
          <Badge tone="neutral">Read only</Badge>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Version history</h2>
        <div
          aria-label="Historical rent policy versions"
          className="mt-3 overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          tabIndex={0}
        >
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-border bg-[var(--table-header-bg)] text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Version</th>
                <th className="py-2 pr-4">Effective</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Frequencies</th>
                <th className="py-2">Timezone</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr className="border-b border-border/70" key={version.id}>
                  <td className="py-2 pr-4">v{version.version_number}</td>
                  <td className="py-2 pr-4">{version.effective_from}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={version.lifecycle === "approved" ? "success" : "neutral"}>
                      {formatLifecycle(version.lifecycle)}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">
                    {version.supported_frequencies?.join(", ") ?? "Unresolved"}
                  </td>
                  <td className="py-2">
                    {version.rent_calculation_timezone ?? "Unresolved"}
                  </td>
                </tr>
              ))}
              {versions.length === 0 ? (
                <tr>
                  <td className="py-4 text-muted-foreground" colSpan={5}>
                    No historical policy versions.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function formatLifecycle(lifecycle: RentPolicyVersion["lifecycle"]) {
  if (lifecycle === "approved") return "Approved";
  if (lifecycle === "draft") return "Draft";
  return "Archived";
}
