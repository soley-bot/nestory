import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";

export default function UpdatePasswordPage() {
  return (
    <AuthPageShell
      description="Choose a new password."
      title="Update password"
      visualSrc="/marketing/login-property-building-blue-hour.png"
    >
      <UpdatePasswordForm />
    </AuthPageShell>
  );
}
