"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { loginAction, type AuthActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AuthActionState = {};

function FieldError({ errors, id }: { errors?: string[]; id: string }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="mt-2 text-xs leading-5 text-danger" id={id}>{errors[0]}</p>;
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const emailErrorId = useId();
  const passwordErrorId = useId();

  return (
    <form action={action} className="space-y-5">
      {state.message ? (
        <p
          className="rounded-md border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm leading-5 text-danger"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <label className="block text-sm font-semibold text-foreground">
        Email
        <Input
          aria-describedby={state.fieldErrors?.email?.length ? emailErrorId : undefined}
          aria-invalid={Boolean(state.fieldErrors?.email?.length)}
          autoComplete="email"
          className="mt-2 box-border h-11 px-3 text-[15px] text-foreground placeholder:text-foreground-subtle"
          name="email"
          placeholder="admin@example.com"
          type="email"
        />
        <FieldError errors={state.fieldErrors?.email} id={emailErrorId} />
      </label>

      <label className="block text-sm font-semibold text-foreground">
        Password
        <Input
          aria-describedby={state.fieldErrors?.password?.length ? passwordErrorId : undefined}
          aria-invalid={Boolean(state.fieldErrors?.password?.length)}
          autoComplete="current-password"
          className="mt-2 box-border h-11 px-3 text-[15px] text-foreground placeholder:text-foreground-subtle"
          name="password"
          placeholder="Enter password"
          type="password"
        />
        <FieldError errors={state.fieldErrors?.password} id={passwordErrorId} />
      </label>

      <div className="-mt-2 text-right">
        <Link
          className="text-sm font-semibold text-foreground-muted transition-colors hover:text-foreground"
          href="/forgot-password"
        >
          Forgot password?
        </Link>
      </div>

      <Button
        className="box-border h-11 w-full border-foreground bg-foreground text-[12px] font-semibold uppercase tracking-[0.14em] text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-70"
        disabled={pending}
        type="submit"
        variant="primary"
      >
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
