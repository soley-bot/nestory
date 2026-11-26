"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FinancialForm } from "@/lib/finance/financial-write-provider";
import type { FinancialWriteContext } from "@/lib/finance/financial-write-context";
import { setPilotRentAutoPostingAction, type PilotRentPostingActionState } from "../pilot-rent-posting-actions";

export function PilotRentPostingSetting({ context }: { context: FinancialWriteContext | null }) {
  const [state, action, pending] = useActionState(setPilotRentAutoPostingAction, { kind: "idle" } as PilotRentPostingActionState);
  useEffect(() => { if (state.kind === "confirmed") window.location.reload(); }, [state.kind]);
  const available = context?.status === "open" && context.enforced &&
    context.automatic_rent_enabled !== undefined && !!context.automatic_rent_updated_at;
  const enabled = available ? context.automatic_rent_enabled : false;
  return <section className="mt-6 space-y-3 rounded-xl border bg-card p-5" aria-labelledby="pilot-rent-posting-title">
    <h2 id="pilot-rent-posting-title" className="text-lg font-semibold">Pilot automatic rent posting</h2>
    <p className="text-sm text-muted-foreground">When on, the next normal schedule and ordinary eligible lease updates can generate missing rent for the current billing month. Turning this on does not generate invoices immediately.</p>
    {!available ? <p role="status" className="text-sm">{context?.status === "frozen" ? "Pilot is frozen while financial changes are paused. Reload after the reset is complete." : "Pilot's rent posting setting is unavailable. Reload this page to verify its current state."}</p> : <>
      <p className="text-sm font-medium" role="status">Automatic rent posting is {enabled ? "on" : "off"}.</p>
      <FinancialForm action={action}>
        <input type="hidden" name="expectedUpdatedAt" value={context.automatic_rent_updated_at!} />
        <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
        <Button type="submit" disabled={pending || state.kind === "confirmed" || state.kind === "uncertain"}>
          {pending ? "Saving…" : enabled ? "Turn off automatic rent posting" : "Turn on automatic rent posting"}
        </Button>
      </FinancialForm>
    </>}
    {state.message && <p role={state.kind === "confirmed" ? "status" : "alert"} className="text-sm">{state.message}</p>}
    {state.kind === "uncertain" && <Button type="button" variant="outline" onClick={() => window.location.reload()}>Reload current setting</Button>}
  </section>;
}
