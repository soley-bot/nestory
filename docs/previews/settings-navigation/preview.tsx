import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SettingsShell } from "../../../src/components/layout/settings-shell";
import { OrganizationIdentityEditor } from "../../../src/features/organization/components/organization-identity-editor";
import { useSettingsNavigationGuard } from "../../../src/components/layout/settings-navigation-guard";
import Link from "next/link";
import "../../../src/app/globals.css";

function CompanyEditor() {
  const guard = useSettingsNavigationGuard()!;
  const editor = React.useRef<{ discard: () => void }>(null);
  useEffect(() => { guard.registerDraftController({ discard: () => editor.current?.discard() }); return () => guard.registerDraftController(null); }, [guard]);
  return <OrganizationIdentityEditor ref={editor} branchCount={1} teamCount={1} organizationName="Sample Property Company" organizationSlug="sample-company" workspaceUrl="https://sample-company.example.com/" workspaceSetup={{ preferredCurrency: "USD", operationalTimezone: "Asia/Phnom_Penh" }} onDraftStatusChange={guard.setDraftStatus} />;
}
function Preview() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => { const update = () => setPath(location.pathname); window.addEventListener("popstate", update); window.addEventListener("preview-route", update); return () => { window.removeEventListener("popstate", update); window.removeEventListener("preview-route", update); }; }, []);
  return <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1440, margin: "0 auto" }}>
    <div className="flex min-h-12 items-center justify-between border-b px-4 text-sm sm:px-6"><span className="font-semibold">Nestory <span className="ml-2 font-normal text-muted-foreground">Synthetic preview</span></span><Link href="/people">People</Link></div>
    <SettingsShell activeHref={path} role="super_admin">
      {path === "/settings/organization" ? <CompanyEditor /> : <section className="py-6"><h2 className="font-semibold">Synthetic navigation destination</h2><Link className="mt-4 inline-flex min-h-11 items-center text-primary" href="/settings/organization">Return to Organization</Link></section>}
    </SettingsShell>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
