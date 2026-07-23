import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { ImplicitSessionCompletion } from "@/features/auth/components/implicit-session-completion";
import { safeAuthNextPath } from "@/lib/auth/redirect";

type AuthCompletePageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

export default async function AuthCompletePage({
  searchParams,
}: AuthCompletePageProps) {
  const params = await searchParams;
  const requestedNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = safeAuthNextPath(requestedNext ?? null);

  return (
    <AuthPageShell
      contextLabel="Secure access"
      contextText="Your invitation is being connected to the correct workspace and access level."
      contextTitle="One moment while we open your workspace."
      description="Keep this page open while Nestory verifies the secure email link."
      title="Completing sign in"
    >
      <ImplicitSessionCompletion nextPath={nextPath} />
    </AuthPageShell>
  );
}
