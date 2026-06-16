import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="w-full max-w-sm rounded-md border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold tracking-tight">Sign in to Nestory</h1>
        <form className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Email
            <Input className="mt-2" placeholder="admin@example.com" type="email" />
          </label>
          <label className="block text-sm font-medium">
            Password
            <Input className="mt-2" placeholder="Enter password" type="password" />
          </label>
          <Button className="w-full" type="submit" variant="primary">
            Sign in
          </Button>
        </form>
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
