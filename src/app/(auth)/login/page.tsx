import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <AuthPageShell
      contextText="Every lease, rent movement, maintenance case, and document stays tied to the property it belongs to."
      contextTitle="Return to the record."
      description="Continue to your workspace."
      switchHref="/signup"
      switchLabel="Create workspace"
      switchText="New to Nestory?"
      title="Sign in"
      visualSrc="/marketing/login-property-building-blue-hour.png"
    >
      <LoginForm />
    </AuthPageShell>
  );
}
