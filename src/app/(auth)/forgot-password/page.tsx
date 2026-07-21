import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell
      contextLabel="Account recovery"
      contextText="Supabase securely verifies the recovery link before Nestory accepts a new password."
      contextTitle="Recover access without creating another account."
      description="Enter the email for your invited Nestory account."
      switchHref="/login"
      switchLabel="Sign in"
      switchText="Remember your password?"
      title="Forgot password"
      visualSrc="/marketing/login-property-building-blue-hour.png"
    >
      <ForgotPasswordForm />
    </AuthPageShell>
  );
}
