import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { ImplicitSessionCompletion } from "@/features/auth/components/implicit-session-completion";
import { Button } from "@/components/ui/button";
import { safeAuthNextPath } from "@/lib/auth/redirect";

type AuthCompletePageProps = {
  searchParams: Promise<{
    next?: string | string[];
    token_hash?: string | string[];
    type?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AuthCompletePage({
  searchParams,
}: AuthCompletePageProps) {
  const params = await searchParams;
  const requestedNext = firstValue(params.next);
  const tokenHash = firstValue(params.token_hash);
  const type = firstValue(params.type);
  const nextPath = safeAuthNextPath(requestedNext ?? null);

  if (tokenHash && type === "recovery") {
    return (
      <AuthPageShell
        description="Confirm that you want to continue before we verify this one-time link."
        title="Confirm password reset"
      >
        <form action="/auth/confirm" method="post">
          <input name="token_hash" type="hidden" value={tokenHash} />
          <input name="type" type="hidden" value="recovery" />
          <Button className="w-full" type="submit">
            Continue to reset password
          </Button>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Only continue if you requested this password reset.
          </p>
        </form>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      description="Keep this page open."
      title="Signing you in"
    >
      <ImplicitSessionCompletion nextPath={nextPath} />
    </AuthPageShell>
  );
}
