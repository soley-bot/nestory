import Link from "next/link";
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
      contextLabel="Managed access"
      contextText="Every Nestory workspace is provisioned for a client organization and every account is explicitly invited."
      contextTitle="Access with a verified identity."
      description={descriptionFor(invitation.state)}
      title={titleFor(invitation.state)}
      visualSrc="/marketing/login-property-building-blue-hour.png"
    >
      {invitation.state === "signed_out" ? (
        <div className="space-y-4 text-sm leading-6 text-foreground-muted">
          <p>Open the newest invitation email to verify the invited address and continue.</p>
          <Link className="font-semibold text-foreground" href="/login">
            Sign in with an existing account
          </Link>
        </div>
      ) : null}

      {invitation.state === "unavailable" ? (
        <div className="space-y-4 text-sm leading-6 text-foreground-muted">
          <p>
            The link may be invalid, expired, revoked, or assigned to a different email than
            {invitation.accountEmail ? ` ${invitation.accountEmail}` : " this account"}.
          </p>
          <form action={signOutAction}>
            <button className="font-semibold text-foreground" type="submit">
              Use another account
            </button>
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
          className="inline-flex h-11 w-full items-center justify-center rounded-md bg-foreground px-4 text-sm font-semibold text-background"
          href="/workspace"
        >
          Open workspace
        </Link>
      ) : null}

      {invitation.state === "expired" || invitation.state === "revoked" || invitation.state === "send_failed" ? (
        <div className="space-y-4 text-sm leading-6 text-foreground-muted">
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
    <dl className="grid gap-3 rounded-md border border-border bg-surface-muted p-4 text-sm">
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
      <dt className="text-foreground-muted">{label}</dt>
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
  if (state === "pending") return "Review the assigned access before joining this workspace.";
  if (state === "accepted") return "This account already has workspace access.";
  if (state === "signed_out") return "Continue from the secure link sent to the invited email.";
  return "This invitation cannot be accepted in the current session.";
}
