import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { SignupForm } from "@/features/auth/components/signup-form";

export default function SignupPage() {
  return (
    <AuthPageShell
      description="Start with one clean admin workspace."
      switchHref="/login"
      switchLabel="Sign in"
      switchText="Already have access?"
      title="Create workspace"
    >
      <SignupForm />
    </AuthPageShell>
  );
}
