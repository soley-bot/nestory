import Link from "next/link";
import { signOutAction } from "@/features/auth/actions";
import { AuthPageShell } from "@/features/auth/components/auth-page-shell";

export default function NoAccessPage() {
  return (
    <AuthPageShell
      description="This account is signed in, but it is not linked to this workspace."
      title="No workspace access"
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-[#6e7681]">
          Ask an admin to add this email under Users & Roles, or sign in with an
          account that already belongs here.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex h-9 items-center rounded-md border border-[#dfe3e8] px-3 text-sm font-semibold text-[#080b12] shadow-sm transition-colors hover:bg-[#f6f7f9]"
            href="/login"
          >
            Try another account
          </Link>
          <form action={signOutAction}>
            <button
              className="inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold text-[#6e7681] transition-colors hover:bg-[#f6f7f9] hover:text-[#080b12]"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </AuthPageShell>
  );
}
