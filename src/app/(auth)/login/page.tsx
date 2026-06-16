import Link from "next/link";
import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="w-full max-w-sm rounded-md border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold tracking-tight">Sign in to Nestory</h1>
        <LoginForm />
        <p className="mt-5 text-sm text-muted">
          Need access?{" "}
          <Link className="font-medium text-accent" href="/signup">
            Create the admin account
          </Link>
        </p>
      </section>
    </main>
  );
}
