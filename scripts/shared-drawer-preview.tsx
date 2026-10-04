import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { SideDrawer, useDrawerDraftGuard } from "../src/components/ui/side-drawer";
import { FormSection } from "../src/components/ui/form-section";
import { Button } from "../src/components/ui/button";
import { Card, CardContent, CardFooter } from "../src/components/ui/card";

function Fields() {
  const guard = useMemo(() => ({ status: "dirty" as const }), []);
  useDrawerDraftGuard(guard);
  return <div className="space-y-6 px-5 pb-5">
    <FormSection title="Property and responsible team" step="1" description="Review the full property name and the team responsible for this maintenance request.">
      <label className="grid gap-2">Property name<input className="min-w-0 w-full rounded-md border bg-background p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50" defaultValue="North Riverside Residential Property Management and Maintenance Partnership" /></label>
      <p className="leading-6">North Riverside Residential Property Management and Maintenance Partnership — assigned to the regional maintenance and finance coordination team.</p>
    </FormSection>
    <FormSection title="Request details and supporting records" step="2">
      <p role="alert" className="rounded-md border border-destructive bg-danger-soft p-3">The request contains unsaved changes. Review the full message before leaving this drawer.</p>
      <label className="grid gap-2">Message<textarea className="min-h-24 w-full rounded-md border bg-background p-2" defaultValue="Please investigate the recurring water supply interruption affecting the upper floors and confirm the repair schedule with the property contact." /></label>
      <Card size="sm"><CardContent>Supporting panel: invoice balance £1,234,567.89. No associated maintenance records yet.</CardContent><CardFooter><Button variant="outline">Review supporting records and payment information</Button></CardFooter></Card>
    </FormSection>
  </div>;
}

function Preview() {
  const [open, setOpen] = useState(true);
  return <main className="min-h-screen bg-background p-5 text-foreground">
    <Button onClick={() => setOpen(true)}>Open synthetic property drawer</Button>
    <SideDrawer open={open} onClose={() => setOpen(false)} title="Edit North Riverside Residential Property Management and Maintenance Partnership" description="A controlled shared drawer fixture with long content, accessible fields and unsaved changes." summary={<p>Unsaved changes — balance £1,234,567.89 remains available.</p>} footer={<><Button variant="outline">Review changes before returning to the property workspace</Button><Button>Save property and maintenance coordination changes</Button></>}>
      <Fields />
    </SideDrawer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
