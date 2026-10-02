import Link from "next/link";
import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";
import { getPasswordRecoveryUser } from "@/lib/auth/recovery-session";

export default async function UpdatePasswordPage() {
  if (!(await getPasswordRecoveryUser())) {
    return (
      <AuthPageShell
        description="Open a fresh recovery link to choose a new password."
        title="Password reset unavailable"
        switchHref="/login"
        switchLabel="Sign in"
        visualSrc="/marketing/login-property-building-blue-hour.png"
      >
        <Link className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" href="/forgot-password">
          Request a new recovery link
        </Link>
      </AuthPageShell>
    );
  }

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
