import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <AuthPageShell
      description="Access your Nestory workspace."
      switchHref="/signup"
      switchLabel="Create account"
      switchText="Need access?"
      title="Sign in"
    >
      <LoginForm />
    </AuthPageShell>
  );
}
