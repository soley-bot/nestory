import { redirect } from "next/navigation";
import {
  getAdminMembershipForUser,
  requireUser,
} from "@/lib/auth/context";
import { signOutAction } from "@/features/auth/actions";
import { SetupOrganizationForm } from "@/features/auth/components/setup-organization-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const user = await requireUser();
  const membership = await getAdminMembershipForUser(user.id);

  if (membership) {
    redirect("/timeline");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="w-full max-w-sm rounded-md border border-border bg-surface p-6">
        <p className="text-sm text-muted">{user.email}</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          Create workspace
        </h1>
        <SetupOrganizationForm />
        <form action={signOutAction} className="mt-4">
          <button className="text-sm font-medium text-accent" type="submit">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
