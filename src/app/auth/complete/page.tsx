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
      description="Keep this page open."
      title="Signing you in"
    >
      <ImplicitSessionCompletion nextPath={nextPath} />
    </AuthPageShell>
  );
}
