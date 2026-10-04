import type { PermissionKey } from "@/lib/auth/permission-catalog";
import { buildRolePermissionPreview } from "@/features/organization/role-permission-preview";

export function RolePermissionPreview({
  archived = false,
  baseline = [],
  pendingChanges,
  permissions,
}: {
  archived?: boolean;
  baseline?: readonly PermissionKey[];
  pendingChanges: boolean;
  permissions: readonly PermissionKey[];
}) {
  const preview = buildRolePermissionPreview(permissions, baseline);
  return (
    <section aria-label="Permission preview" className="grid gap-3 px-5 py-4 text-sm">
      <div>
        <h3 className="font-semibold">Permission preview</h3>
        <p className="mt-1 text-muted-foreground">
          {archived ? "Archived — unavailable for assignment." : pendingChanges ? "Proposed permissions. Save to apply." : "Current role permissions."}
        </p>
        <p className="mt-1 text-muted-foreground">
          One active assigned branch is required. Role edits do not change branch assignments.
        </p>
      </div>
      <dl className="divide-y divide-border">
        {preview.groups.map((group) => (
          <div className="grid gap-1 py-2 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3" key={group.key}>
            <dt className="font-medium">{group.label}</dt>
            <dd className="min-w-0">
              <p>{group.selected.join(", ") || "None"}</p>
              {group.added.length > 0 && pendingChanges ? <p className="mt-1 text-xs text-muted-foreground">Adding: {group.added.join(", ")}</p> : null}
              {group.removed.length > 0 && pendingChanges ? <p className="mt-1 text-xs text-warning">Removing: {group.removed.join(", ")}</p> : null}
            </dd>
          </div>
        ))}
      </dl>
      {preview.effects.length > 0 ? (
        <div className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2">
          <p className="font-medium">Related permission checks</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {preview.effects.map((effect) => <li key={effect}>{effect}</li>)}
          </ul>
        </div>
      ) : null}
      <div className="text-muted-foreground">
        <p className="font-medium">Unavailable in current workspace controls</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {preview.excluded.map((operation) => <li key={operation}>{operation}</li>)}
          <li>Access to another company</li>
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        Record scope, staff assignment and workflow checks still apply.
      </p>
    </section>
  );
}
