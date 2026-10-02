import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { LoginForm } from "@/features/auth/components/login-form";
import { safeLoginNextPath } from "@/lib/auth/login-redirect";

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextPath = safeLoginNextPath(typeof params.next === "string" ? params.next : null);
  return (
    <AuthPageShell
      contextLabel="Property operations"
      contextText="Leases, rent, maintenance, documents, and history stay connected to each property."
      contextTitle="See the full record."
      description="Continue to your workspace."
      title="Sign in"
      visualSrc="/marketing/login-property-building-blue-hour.png"
    >
      {params.password === "updated" ? (
        <p className="mb-5 rounded-md border border-success/25 bg-success-soft px-3.5 py-3 text-sm leading-5 text-success" role="status">
          Your password has been updated. Sign in with your new password.
        </p>
      ) : null}
      <LoginForm nextPath={nextPath} />
    </AuthPageShell>
  );
}
