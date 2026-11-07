import type { Metadata } from "next";
import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell
      description="We will email you a link to reset it."
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

export const metadata: Metadata = { title: "Reset password" };
