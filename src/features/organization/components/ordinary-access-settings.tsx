"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { PERMISSION_CATALOG } from "@/lib/auth/permission-catalog";
import {
  activateOrdinaryAccessAction,
  refreshOrdinaryAccessReadinessAction,
} from "../ordinary-access-actions";
import {
  ORDINARY_ACCESS_BLOCKERS,
  type OrdinaryAccessReadiness,
  type OrdinaryAccessReadResult,
} from "../ordinary-access";

type OrdinaryAccessSettingsProps = {
  initialReadiness: OrdinaryAccessReadResult;
  organizationId: string;
  organizationName: string;
};

export function OrdinaryAccessSettings(props: OrdinaryAccessSettingsProps) {
  return <OrdinaryAccessSettingsState key={JSON.stringify(props)} {...props} />;
}

function OrdinaryAccessSettingsState({
  initialReadiness,
  organizationId,
  organizationName,
}: OrdinaryAccessSettingsProps) {
  const router = useRouter();
  const titleId = useId();
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewTrigger = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const [readResult, setReadResult] = useState(initialReadiness);
  const [confirmation, setConfirmation] = useState<OrdinaryAccessReadiness | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const readiness = readResult.kind === "ready" ? readResult.readiness : null;
  const enabled = readiness?.ordinary_access_enabled === true;

  const unavailable = (): OrdinaryAccessReadResult => ({
    kind: "unavailable",
    message: "Staff access readiness could not be loaded. Refresh to try again.",
  });
  const acceptReadResult = (result: OrdinaryAccessReadResult): OrdinaryAccessReadResult =>
    result.kind === "ready" && result.readiness.organization_id !== organizationId
      ? { kind: "unavailable", message: "The current company changed. Reload this page before reviewing staff access." }
      : result;

  const refresh = (review: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setMessage(null);
    setConfirmation(null);
    startTransition(async () => {
      try {
        const result = acceptReadResult(await refreshOrdinaryAccessReadinessAction());
        setReadResult(result);
        if (review && result.kind === "ready" && result.readiness.activation_ready) {
          setConfirmation(result.readiness);
        }
      } catch {
        setReadResult(unavailable());
      } finally {
        busy.current = false;
      }
    });
  };

  const activate = () => {
    if (busy.current || !confirmation) return;
    busy.current = true;
    const reviewed = confirmation;
    startTransition(async () => {
      try {
        let failure = "The activation result could not be confirmed. Review refreshed readiness before trying again.";
        try {
          const result = await activateOrdinaryAccessAction({
            confirm: true,
            expectedVersion: reviewed.authorization_version,
            expectedImpactFingerprint: reviewed.impact_fingerprint,
          });
          setConfirmation(null);
          if (
            (result.kind === "activated" || result.kind === "already_enabled") &&
            result.readiness.organization_id === organizationId
          ) {
            setReadResult({ kind: "ready", readiness: result.readiness });
            setMessage({
              error: false,
              text: result.kind === "activated" ? "Staff access enabled." : "Staff access is already enabled.",
            });
            router.refresh();
            return;
          }
          if (result.kind === "error" || result.kind === "stale") failure = result.message;
        } catch {
          setConfirmation(null);
        }
        try {
          setReadResult(acceptReadResult(await refreshOrdinaryAccessReadinessAction()));
        } catch {
          setReadResult(unavailable());
        }
        setMessage({ error: true, text: failure });
      } finally {
        busy.current = false;
      }
    });
  };

  return (
    <section
      aria-busy={pending}
      aria-labelledby={titleId}
      className="min-w-0 rounded-xl border bg-card px-4 py-3 sm:px-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-base font-semibold tracking-tight" id={titleId} ref={heading} tabIndex={-1}>
          Staff access
        </h2>
        <Badge tone={enabled ? "success" : "neutral"}>
          {enabled ? "Enabled" : readiness ? "Contained" : "Unavailable"}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {enabled
          ? "Staff use their assigned roles and branches. Invitations still require personal acceptance."
          : "Staff access remains contained until a Super Admin reviews and enables it."}
      </p>
      {readiness && !enabled ? (
        <>
          <p className="mt-3 text-sm">
            {readiness.ordinary_member_count} existing staff memberships and{" "}
            {readiness.live_ordinary_invitation_count} pending staff invitations.
            Review the exact accounts and assignments before enabling access.
          </p>
          {readiness.blockers.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {readiness.blockers.map((blocker) => (
                <li key={blocker}>{ORDINARY_ACCESS_BLOCKERS[blocker]}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      {readResult.kind === "unavailable" ? (
        <p className="mt-3 text-sm text-danger" role="alert">{readResult.message}</p>
      ) : null}
      {message ? (
        <p className={`mt-3 text-sm ${message.error ? "text-danger" : "text-success"}`} role={message.error ? "alert" : "status"}>
          {message.text}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {!enabled && readiness?.activation_ready ? (
          <Button disabled={pending} onClick={() => refresh(true)} ref={reviewTrigger} type="button">
            {pending && !confirmation ? "Checking readiness…" : "Review staff access"}
          </Button>
        ) : null}
        <Button disabled={pending} onClick={() => refresh(false)} type="button" variant="outline">
          {pending && !confirmation && !readiness?.activation_ready ? "Checking readiness…" : "Refresh readiness"}
        </Button>
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !busy.current) setConfirmation(null);
        }}
        open={confirmation !== null}
      >
        <AlertDialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = reviewTrigger.current;
            (trigger && !trigger.disabled ? trigger : heading.current)?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Enable staff access?</AlertDialogTitle>
            <AlertDialogDescription>
              Enable access for {organizationName}. Existing staff memberships
              can use their assigned roles and branches immediately. Pending invitations
              still require each recipient to accept personally.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmation ? (
            <ConsequencePanel
              rows={[
                { label: "Existing staff memberships", value: confirmation.ordinary_member_count },
                { label: "Pending staff invitations", value: confirmation.live_ordinary_invitation_count },
                { label: "Active branches", value: confirmation.active_branch_count },
                { label: "Properties", value: confirmation.property_count },
              ]}
              summary="The accounts and assignments below are the exact reviewed activation impact."
              title="Activation impact"
            >
              No memberships, role assignments, invitation acceptances or emails are created by this action.
            </ConsequencePanel>
          ) : null}
          {confirmation ? <ActivationAssignments readiness={confirmation} /> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep contained</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                activate();
              }}
            >
              {pending ? "Enabling access…" : "Confirm enable staff access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ActivationAssignments({ readiness }: { readiness: OrdinaryAccessReadiness }) {
  const permissions = new Map(PERMISSION_CATALOG.map((permission) => [
    permission.key, `${permission.group}: ${permission.label}`,
  ]));
  const groups = [
    {
      title: "Existing staff gaining access",
      entries: readiness.impact_memberships.map((member) => ({
        ...member, id: member.membership_id, identity: member.email ?? `Account ${member.user_id}`,
      })),
    },
    {
      title: "Invitations still requiring acceptance",
      entries: readiness.impact_invitations.map((invitation) => ({
        ...invitation, id: invitation.invitation_id, identity: invitation.email,
      })),
    },
  ];
  return (
    <div className="grid min-w-0 gap-3 text-sm">
      {groups.map((group) => (
        <section aria-label={group.title} key={group.title}>
          <h3 className="font-semibold">{group.title}</h3>
          {group.entries.length === 0 ? (
            <p className="mt-1 text-muted-foreground">None.</p>
          ) : (
            <ul className="mt-1 space-y-3">
              {group.entries.map((entry) => (
                <li className="min-w-0 break-words rounded-md border p-2" key={entry.id}>
                  <p className="font-medium">{entry.identity}</p>
                  <p className="text-muted-foreground">{entry.branch_name} · {entry.role_name}</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                    {entry.permission_keys.map((key) => <li key={key}>{permissions.get(key)}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
