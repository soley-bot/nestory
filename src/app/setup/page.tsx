import { redirect } from "next/navigation";
import {
  getAdminMembershipForUser,
  requireUser,
} from "@/lib/auth/context";
import { signOutAction } from "@/features/auth/actions";
import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { SetupOrganizationForm } from "@/features/auth/components/setup-organization-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const user = await requireUser();
  const membership = await getAdminMembershipForUser(user.id);

  if (membership) {
    redirect("/overview");
  }

  return (
    <AuthPageShell
      description="Name the company this workspace belongs to."
      title="Finish workspace"
    >
      <div>
        <p className="text-sm leading-6 text-[#6e7681]">{user.email}</p>
        <SetupOrganizationForm />
        <form action={signOutAction} className="mt-5 border-t border-[#edf0f3] pt-4">
          <button
            className="text-sm font-semibold text-[#6e7681] transition-colors hover:text-[#080b12]"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </div>
    </AuthPageShell>
  );
}
