import { ModuleLoading } from "@/components/layout/module-loading";

/**
 * /workspace is a bare redirect that every sign-in passes through. Without this
 * the caller sits on a blank document while the role's entry point resolves.
 */
export default function WorkspaceEntryLoading() {
  return <ModuleLoading heightMode="viewport" title="Opening your workspace" />;
}
