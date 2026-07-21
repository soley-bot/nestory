import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";

export default function UpdatePasswordPage() {
  return (
    <AuthPageShell
      contextLabel="Account recovery"
      contextText="Choose a new password only after opening a valid Supabase recovery link."
      contextTitle="Secure the invited account."
      description="Set a new password for this account."
      title="Update password"
      visualSrc="/marketing/login-property-building-blue-hour.png"
    >
      <UpdatePasswordForm />
    </AuthPageShell>
  );
}
