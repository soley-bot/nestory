import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { SignupForm } from "@/features/auth/components/signup-form";

export default function SignupPage() {
  return (
    <AuthPageShell
      contextText="Start with a workspace that keeps portfolio, rent, maintenance, and records in one operating trail."
      contextTitle="Start with one clean record."
      description="Start with one clean admin workspace."
      switchHref="/login"
      switchLabel="Sign in"
      switchText="Already have access?"
      title="Create workspace"
      visualSrc="/marketing/login-property-building-blue-hour.png"
    >
      <SignupForm />
    </AuthPageShell>
  );
}
