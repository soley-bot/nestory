import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <AuthPageShell
      description="Open your Nestory workspace."
      switchHref="/signup"
      switchLabel="Create workspace"
      switchText="New to Nestory?"
      title="Sign in"
    >
      <LoginForm />
    </AuthPageShell>
  );
}
