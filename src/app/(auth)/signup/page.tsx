import Link from "next/link";
import { SignupForm } from "@/features/auth/components/signup-form";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="w-full max-w-sm rounded-md border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold tracking-tight">Create admin account</h1>
        <SignupForm />
        <p className="mt-5 text-sm text-muted">
          Already have access?{" "}
          <Link className="font-medium text-accent" href="/login">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
