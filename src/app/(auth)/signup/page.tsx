import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { SignupForm } from "@/features/auth/components/signup-form";

export default function SignupPage() {
  return (
    <AuthPageShell
      description="Start a focused property management workspace."
      switchHref="/login"
      switchLabel="Sign in"
      switchText="Already have access?"
      title="Create account"
    >
      <SignupForm />
    </AuthPageShell>
  );
}
