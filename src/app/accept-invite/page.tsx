import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";
import { AcceptInvitationForm } from "@/features/auth/components/accept-invitation-form";
import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { getInvitationAcceptance } from "@/features/auth/invitation-acceptance";
import { formatWorkspaceAccessRole } from "@/features/organization/access-status";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const invitationId = typeof params.invitation === "string" ? params.invitation : "";
  const invitation = await getInvitationAcceptance(invitationId);

  return (
    <AuthPageShell
      description={descriptionFor(invitation.state)}
      title={titleFor(invitation.state)}
      visualSrc="/marketing/login-property-building-blue-hour.png"
    >
      {invitation.state === "signed_out" ? (
        <div className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>Open the link in your invitation email to continue.</p>
          <Link className="font-semibold text-foreground" href="/login">
            Sign in with an existing account
          </Link>
        </div>
      ) : null}

      {invitation.state === "unavailable" ? (
        <div className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            It may have expired, been revoked, or been sent to an address other
            than
            {invitation.accountEmail ? ` ${invitation.accountEmail}` : " this one"}
            .
          </p>
          <form action={signOutAction}>
            <Button className="h-11 w-full" type="submit" variant="outline">
              Sign in with another account
            </Button>
          </form>
        </div>
      ) : null}

      {invitation.state === "pending" ? (
        <div className="space-y-5">
          <InvitationSummary invitation={invitation} />
          <AcceptInvitationForm
            invitationId={invitation.invitationId}
            passwordRequired={invitation.passwordRequired}
          />
        </div>
      ) : null}

      {invitation.state === "accepted" ? (
        <Link
          className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
          href="/workspace"
        >
          Open workspace
        </Link>
      ) : null}

      {invitation.state === "expired" || invitation.state === "revoked" || invitation.state === "send_failed" ? (
        <div className="space-y-4 text-sm leading-6 text-muted-foreground">
          <InvitationSummary invitation={invitation} />
          <p>Ask a workspace administrator to send a new invitation.</p>
        </div>
      ) : null}
    </AuthPageShell>
  );
}

function InvitationSummary({
  invitation,
}: {
  invitation: Exclude<
    Awaited<ReturnType<typeof getInvitationAcceptance>>,
    { state: "signed_out" } | { state: "unavailable" }
  >;
}) {
  return (
    <dl className="grid gap-3 rounded-md border border-border bg-muted p-4 text-sm">
      <SummaryRow label="Workspace" value={invitation.organizationName} />
      <SummaryRow
        label="Access level"
        value={formatWorkspaceAccessRole(invitation.role)}
      />
      <SummaryRow label="Access scope" value={invitation.scopeName} />
      {invitation.staffName ? <SummaryRow label="Linked staff record" value={invitation.staffName} /> : null}
      <SummaryRow label="Account" value={invitation.accountEmail ?? "Verified invited email"} />
    </dl>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function titleFor(state: Awaited<ReturnType<typeof getInvitationAcceptance>>["state"]) {
  if (state === "pending") return "Accept invitation";
  if (state === "accepted") return "Invitation accepted";
  if (state === "signed_out") return "Verify your invitation";
  return "Invitation unavailable";
}

function descriptionFor(state: Awaited<ReturnType<typeof getInvitationAcceptance>>["state"]) {
  if (state === "pending") return "Here is the access you have been given.";
  if (state === "accepted") return "This account already has access.";
  if (state === "signed_out") return "Sign in to continue.";
  return "This invitation cannot be used.";
}
