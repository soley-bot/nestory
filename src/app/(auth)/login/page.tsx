import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <AuthPageShell
      contextLabel="Property operations"
      contextText="Leases, rent, maintenance, documents, and history stay connected to each property."
      contextTitle="See the full record."
      description="Continue to your workspace."
      title="Sign in"
      visualSrc="/marketing/login-property-building-blue-hour.png"
    >
      <LoginForm />
    </AuthPageShell>
  );
}
